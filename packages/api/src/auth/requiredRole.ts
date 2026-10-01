/**
 * The required-role gate rejects a sign-in whose token carries none of the roles an operator
 * listed in `OPENID_REQUIRED_ROLE` — including the case where the claim is absent entirely,
 * which is how an unprovisioned account presents. The rejection is a configuration outcome the
 * person can act on, not an authentication fault, so it is carried as its own code all the way
 * to the login screen instead of collapsing into the generic failure.
 */
const REQUIRED_ROLE_FAILURE_SUFFIX = 'role to log in.';

/** Reads as a sentence whichever way an operator configured the gate. */
function describeRequiredRoles(requiredRoles: string[]): string {
  if (requiredRoles.length === 1) {
    return `"${requiredRoles[0]}"`;
  }
  return `one of: ${requiredRoles.map((role) => `"${role}"`).join(', ')}`;
}

export function buildRequiredRoleError(requiredRoles: string[]): Error {
  return new Error(
    `You must have ${describeRequiredRoles(requiredRoles)} ${REQUIRED_ROLE_FAILURE_SUFFIX}`,
  );
}

/**
 * Recognises the gate's rejection at a boundary that only receives the message: passport reports
 * a declined sign-in as `info`, which carries no error instance to inspect.
 */
export function isRequiredRoleFailure(message?: unknown): boolean {
  return typeof message === 'string' && message.endsWith(REQUIRED_ROLE_FAILURE_SUFFIX);
}
