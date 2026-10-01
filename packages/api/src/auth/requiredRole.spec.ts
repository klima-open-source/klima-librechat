import { buildRequiredRoleError, isRequiredRoleFailure } from './requiredRole';

describe('buildRequiredRoleError', () => {
  it('names the single configured role', () => {
    expect(buildRequiredRoleError(['BUILDER']).message).toBe(
      'You must have "BUILDER" role to log in.',
    );
  });

  it('lists every configured role when the gate accepts several', () => {
    expect(buildRequiredRoleError(['ops', 'BUILDER', 'USER']).message).toBe(
      'You must have one of: "ops", "BUILDER", "USER" role to log in.',
    );
  });
});

describe('isRequiredRoleFailure', () => {
  it('recognises the rejection it builds, for any configured role list', () => {
    expect(isRequiredRoleFailure(buildRequiredRoleError(['BUILDER']).message)).toBe(true);
    expect(isRequiredRoleFailure(buildRequiredRoleError(['ops', 'USER']).message)).toBe(true);
  });

  it('leaves every other sign-in failure on the generic path', () => {
    expect(isRequiredRoleFailure('Email domain not allowed')).toBe(false);
    expect(isRequiredRoleFailure('auth_failed')).toBe(false);
  });

  it('tolerates a declined sign-in that carried no message', () => {
    expect(isRequiredRoleFailure(undefined)).toBe(false);
    expect(isRequiredRoleFailure(null)).toBe(false);
    expect(isRequiredRoleFailure({ message: 'role to log in.' })).toBe(false);
  });
});
