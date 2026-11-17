import { ErrorTypes, extractEnvVariable } from 'librechat-data-provider';
import type { OpenIDExchangedToken } from '~/auth/openid/exchange';
import { OPENID_EXPIRY_BUFFER_SECONDS } from '~/oauth/expiry';

/**
 * Resolves to the user's exchanged OpenID access token (RFC 8693, obtained at login). Only header
 * values of operator-defined servers (`librechat.yaml` or admin config) ever resolve it; user and
 * database servers have every `{{LIBRECHAT_OPENID_*}}` placeholder stripped when they are saved.
 */
export const OPENID_EXCHANGED_TOKEN_PLACEHOLDER = '{{LIBRECHAT_OPENID_EXCHANGED_TOKEN}}';

const PLACEHOLDER_PATTERN = /\{\{LIBRECHAT_OPENID_EXCHANGED_TOKEN\}\}/;
const PLACEHOLDER_REPLACEMENT_PATTERN = /\{\{LIBRECHAT_OPENID_EXCHANGED_TOKEN\}\}/g;

/** Loads the user's stored exchanged token, or `null` when none is usable. */
export type OpenIDExchangedTokenLoader = (userId: string) => Promise<OpenIDExchangedToken | null>;

/**
 * The server needs the user's exchanged token and it is missing or expired. 403 rather than 401
 * so the client's app-session refresh interceptor does not replay the request: only a new OpenID
 * login issues a new token. `code` is the stable value the client maps to localized copy.
 */
export class OpenIDExchangedTokenRequiredError extends Error {
  readonly code: ErrorTypes.TOOL_ACCESS_EXPIRED = ErrorTypes.TOOL_ACCESS_EXPIRED;
  readonly statusCode = 403 as const;

  constructor() {
    super('Your access to this tool expired. Sign in again to keep using it.');
    this.name = 'OpenIDExchangedTokenRequiredError';
    Object.setPrototypeOf(this, OpenIDExchangedTokenRequiredError.prototype);
  }
}

interface ExchangedTokenConfig {
  source?: string;
  dbId?: string;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, string>;
}

/** Request-local: keyed by the request's user object so the token is never serialized with it. */
const attachedTokens = new WeakMap<object, OpenIDExchangedToken>();

function containsPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return PLACEHOLDER_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(extractEnvVariable(value));
}

function isUsable(token: OpenIDExchangedToken | null | undefined): token is OpenIDExchangedToken {
  return (
    token != null &&
    token.accessToken.length > 0 &&
    token.expiresAt - OPENID_EXPIRY_BUFFER_SECONDS * 1000 > Date.now()
  );
}

/** Whether the exchanged token may resolve for this config: operator-defined servers only. */
export function isOpenIDExchangedTokenSource(config: { source?: string; dbId?: string }): boolean {
  return config.dbId == null && (config.source === 'yaml' || config.source === 'config');
}

/** Whether a trusted operator config routes the exchanged token through its headers. */
export function usesOpenIDExchangedToken(config: object): boolean {
  const candidate = config as ExchangedTokenConfig;
  if (!isOpenIDExchangedTokenSource(candidate)) {
    return false;
  }
  return [candidate.headers, candidate.requestHeaders].some(
    (headers) => headers != null && Object.values(headers).some(containsPlaceholder),
  );
}

/**
 * Loads the exchanged token for a server that needs it and binds it to `user` for this request,
 * so the synchronous `processMCPEnv` pass can resolve it. Rejects with
 * `OpenIDExchangedTokenRequiredError` instead of letting a missing token reach the server.
 */
export async function attachOpenIDExchangedToken({
  user,
  config,
  load,
}: {
  user?: { id?: string } | null;
  config: object;
  load?: OpenIDExchangedTokenLoader;
}): Promise<void> {
  if (user?.id == null || !usesOpenIDExchangedToken(config)) {
    return;
  }
  const token = load ? await load(user.id) : null;
  if (!isUsable(token)) {
    throw new OpenIDExchangedTokenRequiredError();
  }
  attachedTokens.set(user, token);
}

/**
 * Replaces the placeholder in an operator-authored header value with the token bound to `user`.
 * The caller decides trust (see `isOpenIDExchangedTokenSource`). Without a user the value stays
 * literal; with one, a missing or expired token throws rather than sending an empty bearer.
 */
export function resolveOpenIDExchangedTokenPlaceholder(value: string, user?: object): string {
  if (user == null || !PLACEHOLDER_PATTERN.test(value)) {
    return value;
  }
  const token = attachedTokens.get(user);
  if (!isUsable(token)) {
    throw new OpenIDExchangedTokenRequiredError();
  }
  return value.replace(PLACEHOLDER_REPLACEMENT_PATTERN, () => token.accessToken);
}
