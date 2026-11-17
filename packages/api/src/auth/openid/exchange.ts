import { openIdTokenExchangeSchema } from 'librechat-data-provider';
import { logger, encryptV2, decryptV2 } from '@librechat/data-schemas';
import type { TOpenIdTokenExchangeConfig } from 'librechat-data-provider';
import type { TokenMethods } from '@librechat/data-schemas';
import { getSafeErrorMetadata } from '~/utils/errors';

const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const LOG_PREFIX = '[OpenIDTokenExchange]';
const TOKEN_QUERY = { type: 'openid_exchanged', identifier: 'openid:exchanged' };

/**
 * Sends one grant to the OpenID token endpoint with the client's configured authentication
 * (openid-client's `genericGrantRequest`). A refusal rejects with the OAuth `error` value on the
 * thrown object, as openid-client's `ResponseBodyError` carries it.
 */
export type TokenExchangeGrant = (
  grantType: string,
  parameters: Record<string, string>,
) => Promise<{ access_token?: unknown; expires_in?: unknown }>;

/** `expiresAt` is epoch milliseconds. */
export interface OpenIDExchangedToken {
  accessToken: string;
  expiresAt: number;
}

type ExchangeResult =
  | { ok: true; value: { accessToken: string; expiresIn: number } }
  | { ok: false; error: { code: 'refused' | 'invalid_response' } };

/** Refusals and unusable responses resolve with a code; transport failures reject. */
async function exchangeOpenIDAccessToken(
  subjectToken: string,
  audience: string,
  grant: TokenExchangeGrant,
): Promise<ExchangeResult> {
  let response: Awaited<ReturnType<TokenExchangeGrant>>;
  try {
    response = await grant('urn:ietf:params:oauth:grant-type:token-exchange', {
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_token_type: ACCESS_TOKEN_TYPE,
      audience,
    });
  } catch (error) {
    if (typeof (error as { error?: unknown } | null)?.error === 'string') {
      return { ok: false, error: { code: 'refused' } };
    }
    throw error;
  }
  const { access_token: accessToken, expires_in: expiresIn } = response ?? {};
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof expiresIn !== 'number' ||
    !(expiresIn > 0)
  ) {
    return { ok: false, error: { code: 'invalid_response' } };
  }
  return { ok: true, value: { accessToken, expiresIn } };
}

/**
 * Returns `null` when no token is usable: never stored, expired, or undecryptable (e.g. after a
 * `CREDS_KEY` rotation); signing in again resolves each. Query failures still reject.
 */
export async function loadOpenIDExchangedToken({
  userId,
  findToken,
}: {
  userId: string;
  findToken: TokenMethods['findToken'];
}): Promise<OpenIDExchangedToken | null> {
  const record = await findToken({ userId, ...TOKEN_QUERY });
  const expiresAt = record ? new Date(record.expiresAt).getTime() : NaN;
  if (record == null || !(expiresAt > Date.now())) {
    return null;
  }
  try {
    const accessToken = await decryptV2(record.token);
    return accessToken ? { accessToken, expiresAt } : null;
  } catch (error) {
    logger.warn(`${LOG_PREFIX} Stored token could not be decrypted`, getSafeErrorMetadata(error));
    return null;
  }
}

/** Never rejects, so a storage failure cannot fail logout. */
export async function clearOpenIDExchangedToken({
  userId,
  deleteTokens,
}: {
  userId: string;
  deleteTokens: TokenMethods['deleteTokens'];
}): Promise<void> {
  try {
    await deleteTokens({ userId, ...TOKEN_QUERY });
  } catch (error) {
    logger.error(`${LOG_PREFIX} Failed to delete the token`, getSafeErrorMetadata(error));
  }
}

/**
 * Exchanges the login's access token (RFC 8693) and stores the result encrypted. Never rejects:
 * login proceeds regardless, and an MCP server needing the token asks the user to sign in again.
 */
export async function exchangeOpenIDTokenAtLogin({
  userId,
  provider,
  subjectToken,
  loadConfig,
  grant,
  methods,
}: {
  userId?: string;
  provider?: string;
  subjectToken?: string;
  loadConfig: () => Promise<Partial<TOpenIdTokenExchangeConfig> | undefined>;
  grant: TokenExchangeGrant;
  methods: Pick<TokenMethods, 'createToken' | 'updateToken'>;
}): Promise<'stored' | 'skipped' | 'failed'> {
  if (provider !== 'openid' || !userId) {
    return 'skipped';
  }
  try {
    const config = await loadConfig();
    if (config?.enabled !== true || !subjectToken) {
      return 'skipped';
    }
    const { audience } = openIdTokenExchangeSchema.parse(config);
    const result = await exchangeOpenIDAccessToken(subjectToken, audience, grant);
    if (!result.ok) {
      logger.warn(`${LOG_PREFIX} Exchange failed; continuing login`, { code: result.error.code });
      return 'failed';
    }
    const token = await encryptV2(result.value.accessToken);
    const query = { userId, ...TOKEN_QUERY };
    const update = { token, expiresIn: result.value.expiresIn };
    if ((await methods.updateToken(query, update)) == null) {
      await methods.createToken({ ...query, ...update });
    }
    return 'stored';
  } catch (error) {
    logger.error(`${LOG_PREFIX} Exchange failed; continuing login`, getSafeErrorMetadata(error));
    return 'failed';
  }
}
