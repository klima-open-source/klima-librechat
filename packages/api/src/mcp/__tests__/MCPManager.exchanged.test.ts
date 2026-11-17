import type { IUser } from '@librechat/data-schemas';
import type * as t from '~/mcp/types';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { OpenIDExchangedTokenRequiredError } from '~/mcp/exchanged';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('~/auth/domain', () => ({
  isMCPDomainAllowed: jest.fn().mockResolvedValue(true),
}));

const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  isAppServerConfig: jest.fn().mockResolvedValue(false),
  resolveAllowlists: jest.fn(async () => ({
    allowedDomains: null,
    allowedAddresses: null,
    useSSRFProtection: false,
  })),
};

jest.mock('~/mcp/registry/MCPServersRegistry', () => ({
  MCPServersRegistry: { getInstance: () => mockRegistryInstance },
}));

jest.mock('~/mcp/registry/MCPServersInitializer', () => ({
  MCPServersInitializer: { initialize: jest.fn() },
}));

jest.mock('~/mcp/ConnectionsRepository');
jest.mock('~/mcp/MCPConnectionFactory');

const TOKEN = 'exchanged-legacy-token';
const serverName = 'solarverso';
const user = { id: 'user-1', provider: 'openid', openidId: 'subject-1' } as IUser;

function serverConfig(overrides: Partial<t.ParsedServerConfig> = {}): t.ParsedServerConfig {
  return {
    type: 'streamable-http',
    url: 'https://solarverso.example.com/mcp',
    source: 'yaml',
    requiresOAuth: false,
    headers: { Authorization: 'Bearer {{LIBRECHAT_OPENID_EXCHANGED_TOKEN}}' },
    ...overrides,
  } as t.ParsedServerConfig;
}

function fakeConnection() {
  return {
    isConnected: jest.fn().mockResolvedValue(true),
    setRequestHeaders: jest.fn(),
    getLastConnectionCheckError: jest.fn(),
    timeout: 30000,
    client: {
      request: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    },
  };
}

async function createManager(load: jest.Mock) {
  return MCPManager.createInstance({}, { loadOpenIDExchangedToken: load });
}

const flowManager = {} as Parameters<MCPManager['callTool']>[0]['flowManager'];

describe('MCPManager exchanged OpenID token', () => {
  beforeEach(() => {
    (MCPManager as unknown as { instance: null }).instance = null;
    jest.clearAllMocks();
    (MCPServersInitializer.initialize as jest.Mock).mockResolvedValue(undefined);
  });

  describe('callTool', () => {
    it("sends the user's exchanged token as the bearer of a config-defined server", async () => {
      const load = jest
        .fn()
        .mockResolvedValue({ accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 });
      const connection = fakeConnection();
      const manager = await createManager(load);
      jest
        .spyOn(manager, 'getConnection')
        .mockResolvedValue(connection as unknown as MCPConnection);

      await manager.callTool({
        user,
        serverName,
        serverConfig: serverConfig(),
        toolName: 'list_plants',
        provider: 'openai',
        flowManager,
      });

      expect(load).toHaveBeenCalledWith('user-1');
      expect(connection.setRequestHeaders).toHaveBeenCalledWith({
        Authorization: `Bearer ${TOKEN}`,
      });
      expect(connection.client.request).toHaveBeenCalledTimes(1);
    });

    it('asks the user to sign in again instead of calling the tool without a token', async () => {
      const load = jest.fn().mockResolvedValue(null);
      const connection = fakeConnection();
      const manager = await createManager(load);
      jest
        .spyOn(manager, 'getConnection')
        .mockResolvedValue(connection as unknown as MCPConnection);

      await expect(
        manager.callTool({
          user,
          serverName,
          serverConfig: serverConfig(),
          toolName: 'list_plants',
          provider: 'openai',
          flowManager,
        }),
      ).rejects.toBeInstanceOf(OpenIDExchangedTokenRequiredError);

      expect(connection.setRequestHeaders).not.toHaveBeenCalled();
      expect(connection.client.request).not.toHaveBeenCalled();
    });

    it('never loads or sends the token for a user-created server', async () => {
      const load = jest
        .fn()
        .mockResolvedValue({ accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 });
      const connection = fakeConnection();
      const manager = await createManager(load);
      jest
        .spyOn(manager, 'getConnection')
        .mockResolvedValue(connection as unknown as MCPConnection);

      await manager.callTool({
        user,
        serverName,
        serverConfig: serverConfig({ source: 'user', dbId: 'db-server-id' }),
        toolName: 'list_plants',
        provider: 'openai',
        flowManager,
      });

      expect(load).not.toHaveBeenCalled();
      expect(JSON.stringify(connection.setRequestHeaders.mock.calls)).not.toContain(TOKEN);
    });
  });

  it('refuses to connect or discover tools when the token is missing', async () => {
    const manager = await createManager(jest.fn().mockResolvedValue(null));
    mockRegistryInstance.getServerConfig.mockResolvedValue(serverConfig());

    await expect(
      manager.getUserConnection({
        user,
        serverName,
        serverConfig: serverConfig(),
        flowManager,
      } as t.UserMCPConnectionOptions),
    ).rejects.toBeInstanceOf(OpenIDExchangedTokenRequiredError);
    await expect(manager.discoverServerTools({ user, serverName })).rejects.toBeInstanceOf(
      OpenIDExchangedTokenRequiredError,
    );
    expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
  });
});
