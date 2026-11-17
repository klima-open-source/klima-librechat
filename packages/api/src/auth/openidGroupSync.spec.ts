import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { openIdGroupSyncSchema } from 'librechat-data-provider';

type DataSchemas = typeof import('@librechat/data-schemas');
type GroupSync = typeof import('./openidGroupSync');

let mongoServer: MongoMemoryServer;
let methods: ReturnType<DataSchemas['createMethods']>;
let logger: DataSchemas['logger'];
let groupSync: GroupSync;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const dataSchemas = await import('@librechat/data-schemas');
  dataSchemas.createModels(mongoose);
  methods = dataSchemas.createMethods(mongoose);
  logger = dataSchemas.logger;
  groupSync = await import('./openidGroupSync');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const config = openIdGroupSyncSchema.parse({
  groups: { solarverso_mcp: 'Solarverso', reports: 'Reports' },
});

let userId: string;
const clearUserConfigCache = jest.fn().mockResolvedValue(undefined);

beforeEach(async () => {
  await mongoose.models.Group.deleteMany({});
  await mongoose.models.User.deleteMany({});
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  jest.spyOn(logger, 'error').mockImplementation(() => logger);
  const user = await methods.createUser({ email: 'a@klima.test', provider: 'openid' });
  userId = String(user._id);
});

const members = async (name: string) =>
  ((await methods.findGroupByQuery({ name }))?.memberIds ?? []) as string[];

function sync(userinfo: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return groupSync.syncOpenIdAccessGroups({
    user: { _id: new mongoose.Types.ObjectId(userId) },
    userinfo,
    config,
    findGroupByQuery: methods.findGroupByQuery,
    addUserToGroup: methods.addUserToGroup,
    removeUserFromGroup: methods.removeUserFromGroup,
    clearUserConfigCache,
    ...overrides,
  });
}

describe('syncOpenIdAccessGroups', () => {
  it('adds and removes membership of mapped groups only', async () => {
    await methods.createGroup({ name: 'Solarverso', source: 'local' });
    await methods.createGroup({ name: 'Reports', source: 'local', memberIds: [userId] });
    await methods.createGroup({ name: 'Manual', source: 'local', memberIds: [userId] });

    await sync({ accesses: ['solarverso_mcp', 'other'] });

    expect(await members('Solarverso')).toEqual([userId]);
    expect(await members('Reports')).toEqual([]);
    expect(await members('Manual')).toEqual([userId]);
    expect(clearUserConfigCache).toHaveBeenCalledWith(undefined, userId);
  });

  it('writes nothing and keeps caches when membership already matches', async () => {
    await methods.createGroup({ name: 'Solarverso', source: 'local', memberIds: [userId] });
    const addUserToGroup = jest.fn();

    await sync({ accesses: ['solarverso_mcp'] }, { addUserToGroup });

    expect(addUserToGroup).not.toHaveBeenCalled();
    expect(clearUserConfigCache).not.toHaveBeenCalled();
  });

  it('warns and skips a mapped group that does not exist', async () => {
    await methods.createGroup({ name: 'Reports', source: 'local' });

    await sync({ accesses: ['solarverso_mcp', 'reports'] });

    expect(await mongoose.models.Group.countDocuments({ name: 'Solarverso' })).toBe(0);
    expect(await members('Reports')).toEqual([userId]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("'Solarverso'"));
  });

  it('keeps memberships when the claim is missing', async () => {
    await methods.createGroup({ name: 'Solarverso', source: 'local', memberIds: [userId] });

    await sync({ sub: 'abc' });

    expect(await members('Solarverso')).toEqual([userId]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs a failure without raw error text and never rejects', async () => {
    const findGroupByQuery = jest.fn().mockRejectedValue(new Error('secret-token in message'));

    await expect(sync({ accesses: [] }, { findGroupByQuery })).resolves.toBeUndefined();

    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('secret-token');
  });

  it('does nothing when the feature is not configured', async () => {
    const findGroupByQuery = jest.fn();

    await sync({ accesses: ['solarverso_mcp'] }, { config: undefined, findGroupByQuery });

    expect(findGroupByQuery).not.toHaveBeenCalled();
  });
});
