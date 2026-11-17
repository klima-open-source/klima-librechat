import { ErrorTypes } from 'librechat-data-provider';
import type { MCPOptions } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import { attachOpenIDExchangedToken, OpenIDExchangedTokenRequiredError } from './exchanged';
import { processMCPEnv, resolveHeaders } from '~/utils/env';
import { isMCPInitializationError } from './errors';

type ServerConfig = MCPOptions & { source?: string; dbId?: string };

const TOKEN = 'exchanged-legacy-token';
const PLACEHOLDER = '{{LIBRECHAT_OPENID_EXCHANGED_TOKEN}}';
const fresh = () => ({ accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 });

function serverConfig(overrides: Record<string, unknown> = {}): ServerConfig {
  return {
    type: 'streamable-http',
    url: 'https://solarverso.example.com/mcp',
    source: 'yaml',
    headers: { Authorization: `Bearer ${PLACEHOLDER}` },
    ...overrides,
  } as ServerConfig;
}

async function userWithToken(): Promise<IUser> {
  const user = { id: 'user-1', provider: 'openid' } as IUser;
  await attachOpenIDExchangedToken({ user, config: serverConfig(), load: async () => fresh() });
  return user;
}

const authorization = (config: MCPOptions) =>
  (config as { headers: Record<string, string> }).headers.Authorization;

describe('exchanged OpenID token for MCP servers', () => {
  it.each(['yaml', 'config'])('injects the bearer for a %s server', async (source) => {
    const user = await userWithToken();
    expect(authorization(processMCPEnv({ options: serverConfig({ source }), user }))).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('resolves the placeholder from operator request headers and env indirection', async () => {
    process.env.SOLARVERSO_AUTHORIZATION = `Bearer ${PLACEHOLDER}`;
    const config = serverConfig({ headers: { Authorization: '${SOLARVERSO_AUTHORIZATION}' } });
    const load = jest.fn(async () => fresh());
    const user = { id: 'user-1' } as IUser;
    await attachOpenIDExchangedToken({
      user,
      config: serverConfig({ headers: undefined, requestHeaders: { Authorization: PLACEHOLDER } }),
      load,
    });
    expect(load).toHaveBeenCalledWith('user-1');
    expect(authorization(processMCPEnv({ options: config, user }))).toBe(`Bearer ${TOKEN}`);
    delete process.env.SOLARVERSO_AUTHORIZATION;
  });

  describe('never reaches untrusted servers', () => {
    it.each([
      ['a user-created server', { source: 'user' }, true],
      ['a database-stored server', { dbId: 'db-id' }, undefined],
      ['a user-created server without the explicit flag', { source: 'user' }, undefined],
      ['an Agent Plugins server', { source: 'plugin' }, undefined],
      ['a server without provenance', { source: undefined }, undefined],
    ])('%s', async (_label, overrides, dbSourced) => {
      const config = serverConfig(overrides);
      const load = jest.fn(async () => fresh());
      await attachOpenIDExchangedToken({ user: { id: 'user-2' }, config, load });
      expect(load).not.toHaveBeenCalled();

      const result = processMCPEnv({ options: config, user: await userWithToken(), dbSourced });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('is not resolved from user-supplied variable values, the URL, or model headers', async () => {
      const user = await userWithToken();
      const config = serverConfig({
        url: `https://solarverso.example.com/mcp?t=${PLACEHOLDER}`,
        headers: { 'X-Api-Key': '{{SOLARVERSO_KEY}}' },
        customUserVars: { SOLARVERSO_KEY: { title: 'Key', description: 'Key' } },
      });
      const result = processMCPEnv({
        options: config,
        user,
        customUserVars: { SOLARVERSO_KEY: PLACEHOLDER },
      });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      const modelHeaders = resolveHeaders({ headers: { Authorization: PLACEHOLDER }, user });
      expect(JSON.stringify(modelHeaders)).not.toContain(TOKEN);
    });
  });

  describe('missing or expired token', () => {
    it.each([
      ['missing', async () => null],
      ['expired', async () => ({ accessToken: TOKEN, expiresAt: Date.now() - 1_000 })],
      ['about to expire', async () => ({ accessToken: TOKEN, expiresAt: Date.now() + 5_000 })],
      ['without a loader', undefined],
    ])('asks the user to sign in again when %s', async (_label, load) => {
      const error = await attachOpenIDExchangedToken({
        user: { id: 'user-1' },
        config: serverConfig(),
        load,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(OpenIDExchangedTokenRequiredError);
      expect(error).toMatchObject({ code: ErrorTypes.TOOL_ACCESS_EXPIRED, statusCode: 403 });
      expect(isMCPInitializationError(error)).toBe(true);
    });

    it('refuses to resolve a token that was never loaded or has since expired', async () => {
      const unloaded = { id: 'user-1' } as IUser;
      expect(() => processMCPEnv({ options: serverConfig(), user: unloaded })).toThrow(
        OpenIDExchangedTokenRequiredError,
      );

      const user = await userWithToken();
      jest.useFakeTimers({ now: Date.now() + 3_600_000 });
      try {
        expect(() => processMCPEnv({ options: serverConfig(), user })).toThrow(
          OpenIDExchangedTokenRequiredError,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('leaves the placeholder literal when there is no user', () => {
      expect(authorization(processMCPEnv({ options: serverConfig() }))).toBe(
        `Bearer ${PLACEHOLDER}`,
      );
    });
  });
});
