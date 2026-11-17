import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = process.env.CREDS_IV ?? '0123456789abcdef0123456789abcdef';

type DataSchemas = typeof import('@librechat/data-schemas');
type Exchange = typeof import('./exchange');

const SUBJECT = 'sso-access-token';
const TOKEN = 'sso-legacy-token';
const userId = new mongoose.Types.ObjectId().toString();

let mongoServer: MongoMemoryServer;
let methods: ReturnType<DataSchemas['createMethods']>;
let logger: DataSchemas['logger'];
let exchange: Exchange;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const dataSchemas = await import('@librechat/data-schemas');
  dataSchemas.createModels(mongoose);
  methods = dataSchemas.createMethods(mongoose);
  logger = dataSchemas.logger;
  exchange = await import('./exchange');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Token.deleteMany({});
  jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  jest.spyOn(logger, 'error').mockImplementation(() => logger);
});

const logs = () =>
  JSON.stringify([(logger.warn as jest.Mock).mock.calls, (logger.error as jest.Mock).mock.calls]);

function login(
  grant: jest.Mock,
  overrides: Partial<Parameters<Exchange['exchangeOpenIDTokenAtLogin']>[0]> = {},
) {
  return exchange.exchangeOpenIDTokenAtLogin({
    userId,
    provider: 'openid',
    subjectToken: SUBJECT,
    loadConfig: async () => ({ enabled: true }),
    grant,
    methods: { createToken: methods.createToken, updateToken: methods.updateToken },
    ...overrides,
  });
}

const load = () => exchange.loadOpenIDExchangedToken({ userId, findToken: methods.findToken });

describe('exchangeOpenIDTokenAtLogin', () => {
  it('stores the exchanged token encrypted with its expiry', async () => {
    const grant = jest.fn().mockResolvedValue({ access_token: TOKEN, expires_in: 86400 });
    const before = Date.now();

    await expect(login(grant)).resolves.toBe('stored');

    expect(grant).toHaveBeenCalledWith('urn:ietf:params:oauth:grant-type:token-exchange', {
      subject_token: SUBJECT,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: 'legacy-api',
    });
    const raw = await mongoose.models.Token.findOne({ userId }).lean<{ token: string }>();
    expect(raw?.token).not.toContain(TOKEN);
    const stored = await load();
    expect(stored?.accessToken).toBe(TOKEN);
    expect(stored?.expiresAt).toBeGreaterThanOrEqual(before + 86400 * 1000);
  });

  it.each([
    [
      'a refusal',
      jest.fn().mockRejectedValue(Object.assign(new Error('x'), { error: 'invalid_grant' })),
    ],
    ['an invalid response', jest.fn().mockResolvedValue({ access_token: TOKEN })],
  ])('stores nothing after %s', async (_label, grant) => {
    await expect(login(grant)).resolves.toBe('failed');
    expect(await mongoose.models.Token.countDocuments({ userId })).toBe(0);
  });

  it('never rejects the login on a transport failure and never logs secrets', async () => {
    const grant = jest.fn().mockRejectedValue(new Error(`upstream echoed ${SUBJECT}`));
    await expect(login(grant)).resolves.toBe('failed');
    expect(logger.error).toHaveBeenCalled();
    expect(logs()).not.toContain(SUBJECT);
  });

  it.each([
    ['disabled', { loadConfig: async () => ({ enabled: false }) }],
    ['unconfigured', { loadConfig: async () => undefined }],
    ['a non-OpenID login', { provider: 'google' }],
  ])('skips the exchange when %s', async (_label, overrides) => {
    const grant = jest.fn();
    await expect(login(grant, overrides)).resolves.toBe('skipped');
    expect(grant).not.toHaveBeenCalled();
  });
});

describe('stored token lifecycle', () => {
  const store = (expiresIn: number) =>
    login(jest.fn().mockResolvedValue({ access_token: TOKEN, expires_in: expiresIn }));

  it('reports absence for a missing, expired or undecryptable token', async () => {
    await expect(load()).resolves.toBeNull();

    await store(-60);
    await expect(load()).resolves.toBeNull();

    await store(86400);
    await mongoose.models.Token.updateOne({ userId }, { token: 'bad-iv:bad-cipher' });
    await expect(load()).resolves.toBeNull();
    expect(logs()).not.toContain('bad-cipher');
  });

  it('deletes the token on logout and never rejects', async () => {
    await store(86400);
    await exchange.clearOpenIDExchangedToken({ userId, deleteTokens: methods.deleteTokens });
    await expect(load()).resolves.toBeNull();

    const deleteTokens = jest.fn().mockRejectedValue(new Error('database unavailable'));
    await expect(
      exchange.clearOpenIDExchangedToken({ userId, deleteTokens }),
    ).resolves.toBeUndefined();
  });
});
