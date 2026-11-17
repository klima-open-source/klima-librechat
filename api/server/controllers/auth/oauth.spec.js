const mockIsEnabled = jest.fn();
const mockGetAdminPanelUrl = jest.fn();
const mockIsAdminPanelRedirect = jest.fn();
const mockGenerateAdminExchangeCode = jest.fn();
const mockSyncUserEntraGroupMemberships = jest.fn();
const mockSetAuthTokens = jest.fn();
const mockSendOpenIDAuthResponse = jest.fn();
const mockGetLogStores = jest.fn();
const mockCheckBan = jest.fn();
const mockGenerateToken = jest.fn();
const mockLogger = { info: jest.fn(), error: jest.fn() };
const mockExchangeOpenIDTokenAtLogin = jest.fn();
const mockResolveAppConfigForUser = jest.fn();
const mockGetAppConfig = jest.fn();
const mockGetOpenIdConfig = jest.fn();
const mockGenericGrantRequest = jest.fn();
const mockCreateToken = jest.fn();
const mockUpdateToken = jest.fn();

jest.mock('librechat-data-provider', () => ({
  CacheKeys: { ADMIN_OAUTH_EXCHANGE: 'admin-oauth-exchange' },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
  DEFAULT_SESSION_EXPIRY: 60000,
}));

jest.mock('@librechat/api', () => ({
  isEnabled: (...args) => mockIsEnabled(...args),
  getAdminPanelUrl: (...args) => mockGetAdminPanelUrl(...args),
  isAdminPanelRedirect: (...args) => mockIsAdminPanelRedirect(...args),
  generateAdminExchangeCode: (...args) => mockGenerateAdminExchangeCode(...args),
  exchangeOpenIDTokenAtLogin: (...args) => mockExchangeOpenIDTokenAtLogin(...args),
  resolveAppConfigForUser: (...args) => mockResolveAppConfigForUser(...args),
}));

jest.mock('openid-client', () => ({
  genericGrantRequest: (...args) => mockGenericGrantRequest(...args),
}));

jest.mock('~/strategies', () => ({
  getOpenIdConfig: (...args) => mockGetOpenIdConfig(...args),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/server/services/PermissionService', () => ({
  syncUserEntraGroupMemberships: (...args) => mockSyncUserEntraGroupMemberships(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

jest.mock('~/server/services/OpenIDRefreshRecovery', () => ({
  sendOpenIDAuthResponse: (...args) => mockSendOpenIDAuthResponse(...args),
}));

jest.mock(
  '~/cache/getLogStores',
  () =>
    (...args) =>
      mockGetLogStores(...args),
);

jest.mock('~/server/middleware', () => ({
  checkBan: (...args) => mockCheckBan(...args),
}));

jest.mock('~/models', () => ({
  generateToken: (...args) => mockGenerateToken(...args),
  createToken: (...args) => mockCreateToken(...args),
  updateToken: (...args) => mockUpdateToken(...args),
}));

const { createOAuthHandler } = require('./oauth');

const ORIGINAL_ENV = process.env;

function buildReq(overrides = {}) {
  return {
    user: {
      _id: 'user-123',
      email: 'admin@example.com',
      provider: 'openid',
      tokenset: { refresh_token: 'openid-refresh-token', access_token: 'openid-access-token' },
      federatedTokens: { refresh_token: 'federated-refresh-token' },
    },
    pkceChallenge: 'pkce-challenge',
    banned: false,
    ...overrides,
  };
}

function buildRes() {
  return {
    headersSent: false,
    redirect: jest.fn(),
  };
}

describe('createOAuthHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      DOMAIN_CLIENT: 'http://localhost:3080',
      DOMAIN_SERVER: 'http://localhost:3080',
      OPENID_REUSE_TOKENS: 'false',
    };
    mockIsEnabled.mockImplementation((value) => value === 'true' || value === true);
    mockGetAdminPanelUrl.mockReturnValue('http://admin.example.com');
    mockIsAdminPanelRedirect.mockReturnValue(true);
    mockGetLogStores.mockReturnValue({});
    mockCheckBan.mockResolvedValue(undefined);
    mockGenerateToken.mockResolvedValue('jwt-token');
    mockGenerateAdminExchangeCode.mockResolvedValue('exchange-code');
    mockSendOpenIDAuthResponse.mockResolvedValue('app-token');
    mockExchangeOpenIDTokenAtLogin.mockResolvedValue('stored');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('omits refresh token from admin exchange when OPENID_REUSE_TOKENS is disabled', async () => {
    const handler = createOAuthHandler('http://admin.example.com/auth/openid/callback');
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      {},
      req.user,
      'jwt-token',
      undefined,
      'http://admin.example.com',
      'pkce-challenge',
      expect.any(Number),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'http://admin.example.com/auth/openid/callback?code=exchange-code',
    );
    expect(mockSendOpenIDAuthResponse).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('includes refresh token in admin exchange when OPENID_REUSE_TOKENS is enabled', async () => {
    process.env.OPENID_REUSE_TOKENS = 'true';
    const handler = createOAuthHandler('http://admin.example.com/auth/openid/callback');
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      {},
      req.user,
      'jwt-token',
      'openid-refresh-token',
      'http://admin.example.com',
      'pkce-challenge',
      expect.any(Number),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'http://admin.example.com/auth/openid/callback?code=exchange-code',
    );
    expect(mockSendOpenIDAuthResponse).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('publishes the standard OpenID login through the durable generation service', async () => {
    process.env.OPENID_REUSE_TOKENS = 'true';
    mockIsAdminPanelRedirect.mockReturnValue(false);
    const handler = createOAuthHandler('http://localhost:3080');
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockSendOpenIDAuthResponse).toHaveBeenCalledWith({
      tokenset: req.user.tokenset,
      user: req.user,
      existingRefreshToken: 'openid-refresh-token',
      openidSubject: undefined,
      openidIssuer: undefined,
      discardSessionTokens: true,
      req,
      res,
    });
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3080');
  });

  it('forwards the refresh token from req.authInfo for non-openid admin providers', async () => {
    const handler = createOAuthHandler('http://admin.example.com/auth/google/callback');
    const req = buildReq({
      user: { _id: 'user-9', email: 'g@example.com', provider: 'google' },
      authInfo: { refreshToken: 'google-refresh-token' },
    });
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      {},
      req.user,
      'jwt-token',
      'google-refresh-token',
      'http://admin.example.com',
      'pkce-challenge',
      expect.any(Number),
    );
  });

  it('omits the refresh token when a non-openid admin login has no authInfo', async () => {
    const handler = createOAuthHandler('http://admin.example.com/auth/google/callback');
    const req = buildReq({
      user: { _id: 'user-9', email: 'g@example.com', provider: 'google' },
    });
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      {},
      req.user,
      'jwt-token',
      undefined,
      'http://admin.example.com',
      'pkce-challenge',
      expect.any(Number),
    );
  });

  it('does not forward refresh tokens for admin providers other than google or openid', async () => {
    const handler = createOAuthHandler('http://admin.example.com/auth/discord/callback');
    const req = buildReq({
      user: { _id: 'user-9', email: 'd@example.com', provider: 'discord' },
      authInfo: { refreshToken: 'discord-refresh-token' },
    });
    const res = buildRes();
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockGenerateAdminExchangeCode).toHaveBeenCalledWith(
      {},
      req.user,
      'jwt-token',
      undefined,
      'http://admin.example.com',
      'pkce-challenge',
      expect.any(Number),
    );
  });
  describe('OpenID token exchange', () => {
    function standardLogin() {
      mockIsAdminPanelRedirect.mockReturnValue(false);
      const handler = createOAuthHandler('http://localhost:3080');
      const req = buildReq({
        user: {
          _id: { toString: () => 'user-123' },
          provider: 'openid',
          tokenset: { access_token: 'sso-access-token', id_token: 'sso-id-token' },
        },
      });
      const res = buildRes();
      return { handler, req, res, next: jest.fn() };
    }

    it('exchanges the SSO access token before redirecting a standard login', async () => {
      const { handler, req, res, next } = standardLogin();
      const order = [];
      mockExchangeOpenIDTokenAtLogin.mockImplementation(async () => {
        order.push('exchange');
        return 'stored';
      });
      res.redirect.mockImplementation(() => order.push('redirect'));

      await handler(req, res, next);

      expect(mockExchangeOpenIDTokenAtLogin).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'openid',
        subjectToken: 'sso-access-token',
        loadConfig: expect.any(Function),
        grant: expect.any(Function),
        methods: { createToken: expect.any(Function), updateToken: expect.any(Function) },
      });
      expect(order).toEqual(['exchange', 'redirect']);
      expect(mockSetAuthTokens).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("reads the exchange settings from the signed-in user's configuration", async () => {
      const { handler, req, res, next } = standardLogin();
      const settings = { enabled: true, audience: 'legacy-api' };
      mockResolveAppConfigForUser.mockResolvedValue({
        registration: { openidTokenExchange: settings },
      });

      await handler(req, res, next);

      const { loadConfig } = mockExchangeOpenIDTokenAtLogin.mock.calls[0][0];
      await expect(loadConfig()).resolves.toBe(settings);
      expect(mockResolveAppConfigForUser).toHaveBeenCalledWith(expect.any(Function), req.user);
    });

    it('sends the grant through the configured OpenID client', async () => {
      const { handler, req, res, next } = standardLogin();
      const openidConfig = { issuer: 'sso' };
      mockGetOpenIdConfig.mockReturnValue(openidConfig);
      mockGenericGrantRequest.mockResolvedValue({ access_token: 'legacy', expires_in: 86400 });

      await handler(req, res, next);

      const { grant } = mockExchangeOpenIDTokenAtLogin.mock.calls[0][0];
      await grant('urn:grant', { audience: 'legacy-api' });
      expect(mockGenericGrantRequest).toHaveBeenCalledWith(openidConfig, 'urn:grant', {
        audience: 'legacy-api',
      });
    });

    it('still completes the login when the exchange fails', async () => {
      const { handler, req, res, next } = standardLogin();
      mockExchangeOpenIDTokenAtLogin.mockResolvedValue('failed');

      await handler(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3080');
      expect(next).not.toHaveBeenCalled();
    });

    it('does not exchange for an admin panel login', async () => {
      const handler = createOAuthHandler('http://admin.example.com/auth/openid/callback');

      await handler(buildReq(), buildRes(), jest.fn());

      expect(mockExchangeOpenIDTokenAtLogin).not.toHaveBeenCalled();
    });
  });
});
