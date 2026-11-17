import { get } from 'lodash';
import { openIdGroupSyncSchema } from 'librechat-data-provider';
import { logger, tenantStorage } from '@librechat/data-schemas';
import type { TOpenIdGroupSyncConfig } from 'librechat-data-provider';
import { getSafeErrorMetadata } from '~/utils/errors';

type SyncedGroup = { _id: { toString(): string }; memberIds?: string[] };

export interface OpenIdGroupSyncParams {
  user: { _id: { toString(): string }; idOnTheSource?: string | null; tenantId?: string };
  userinfo: unknown;
  /** As loaded from librechat.yaml: schema defaults (e.g. `claim`) are not applied yet. */
  config?: Partial<TOpenIdGroupSyncConfig>;
  findGroupByQuery: (filter: Record<string, unknown>) => Promise<SyncedGroup | null>;
  addUserToGroup: (userId: string, groupId: string) => Promise<unknown>;
  removeUserFromGroup: (userId: string, groupId: string) => Promise<unknown>;
  /** Drops the user's cached merged config so group-scoped overrides apply on the next request. */
  clearUserConfigCache: (tenantId: string | undefined, userId: string) => Promise<void>;
}

async function syncGroups(params: OpenIdGroupSyncParams, config: TOpenIdGroupSyncConfig) {
  const { user, userinfo, findGroupByQuery, addUserToGroup, removeUserFromGroup } = params;
  const accesses: unknown = get(userinfo, config.claim);
  /** A missing claim may mean the userinfo request failed, so it never revokes access. */
  if (!Array.isArray(accesses)) {
    logger.warn(`[openidGroupSync] Skipped; claim '${config.claim}' is missing or not an array`);
    return;
  }

  const userId = user._id.toString();
  /** Same member key that `addUserToGroup` stores and `getUserPrincipals` reads. */
  const memberId = user.idOnTheSource || userId;
  const outcomes = await Promise.allSettled(
    Object.entries(config.groups).map(async ([access, name]) => {
      const group = await findGroupByQuery({ name, source: 'local' });
      if (!group) {
        logger.warn(`[openidGroupSync] Group '${name}' mapped from '${access}' does not exist`);
        return false;
      }
      const member = accesses.includes(access);
      if (member === (group.memberIds ?? []).includes(memberId)) {
        return false;
      }
      const sync = member ? addUserToGroup : removeUserFromGroup;
      await sync(userId, group._id.toString());
      logger.info(`[openidGroupSync] ${member ? 'Added' : 'Removed'} user ${userId}: '${name}'`);
      return true;
    }),
  );

  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      logger.error('[openidGroupSync] Group sync failed', getSafeErrorMetadata(outcome.reason));
    }
  }
  if (outcomes.some((outcome) => outcome.status === 'fulfilled' && outcome.value)) {
    await params.clearUserConfigCache(user.tenantId, userId);
  }
}

/** Keeps the user's membership of mapped local groups in sync with the SSO access claim. Never rejects. */
export async function syncOpenIdAccessGroups(params: OpenIdGroupSyncParams): Promise<void> {
  const { config, user } = params;
  if (!config) {
    return;
  }
  try {
    const parsed = openIdGroupSyncSchema.parse(config);
    const run = () => syncGroups(params, parsed);
    await (user.tenantId ? tenantStorage.run({ tenantId: user.tenantId }, run) : run());
  } catch (error) {
    logger.error('[openidGroupSync] Group sync failed', getSafeErrorMetadata(error));
  }
}
