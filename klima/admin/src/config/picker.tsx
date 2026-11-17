import { useState } from 'react';

import type { PrincipalKind, PrincipalRef } from './types';
import type { SelectedUser } from '../users/types';
import type { UserSearch } from '../users/search';
import type { Directory } from './directory';
import type { ApiError } from '../api';

import { buttonPrimary, buttonSecondary, inputField, ErrorNote, Empty, Loading } from '../ui';
import { SearchPanel } from '../users/search';

interface PrincipalPickerProps {
  directory: Directory;
  search: UserSearch;
  kind: PrincipalKind;
  selected: PrincipalRef | null;
  onKindChange: (kind: PrincipalKind) => void;
  onSelect: (principal: PrincipalRef) => void;
}

const KIND_OPTIONS: ReadonlyArray<{ kind: PrincipalKind; label: string; hint: string }> = [
  { kind: 'role', label: 'Role', hint: 'Everyone who holds the role, e.g. ENGINEERING.' },
  { kind: 'group', label: 'Group', hint: 'Every member of one group.' },
  { kind: 'user', label: 'User', hint: 'One person, overriding their role and groups.' },
];

const RoleSelect = ({
  directory,
  selected,
  onSelect,
}: {
  directory: Directory;
  selected: PrincipalRef | null;
  onSelect: (principal: PrincipalRef) => void;
}) => {
  const { roles } = directory;

  if (roles.status === 'loading') {
    return <Loading label="Loading roles…" />;
  }

  if (roles.status === 'failed') {
    return <ErrorNote error={roles.error} label="Could not load roles." />;
  }

  if (roles.data.roles.length === 0) {
    return <Empty>No roles exist yet. Create one under Roles before overriding its config.</Empty>;
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="config-role">
        Role
      </label>
      <select
        id="config-role"
        className={inputField}
        value={selected?.kind === 'role' ? selected.id : ''}
        onChange={(event) => {
          const name = event.target.value;
          if (name) {
            onSelect({ kind: 'role', id: name, label: name });
          }
        }}
      >
        <option value="">Pick a role…</option>
        {roles.data.roles.map((role) => (
          <option key={role.name} value={role.name}>
            {role.name}
            {role.description ? ` — ${role.description}` : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        A role override is addressed by its name, which is what the config document stores as its
        principal id.
      </p>
    </div>
  );
};

/** Creates a local group and selects it, so a new group can get its override right away. */
const CreateGroupForm = ({
  directory,
  onSelect,
}: {
  directory: Directory;
  onSelect: (principal: PrincipalRef) => void;
}) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await directory.createGroup(name.trim());
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName('');
    onSelect({ kind: 'group', id: result.data.group._id, label: result.data.group.name });
  };

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm font-medium text-slate-700" htmlFor="config-new-group">
        New group
      </label>
      <div className="flex gap-2">
        <input
          id="config-new-group"
          className={inputField}
          value={name}
          placeholder="e.g. Solarverso"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className={buttonPrimary} disabled={saving || !name.trim()}>
          {saving ? 'Creating…' : 'Create group'}
        </button>
      </div>
      {error ? <ErrorNote error={error} label="Could not create the group." /> : null}
    </form>
  );
};

const GroupSelect = ({
  directory,
  selected,
  onSelect,
}: {
  directory: Directory;
  selected: PrincipalRef | null;
  onSelect: (principal: PrincipalRef) => void;
}) => {
  const { groups } = directory;

  if (groups.status === 'loading') {
    return <Loading label="Loading groups…" />;
  }

  if (groups.status === 'failed') {
    return <ErrorNote error={groups.error} label="Could not load groups." />;
  }

  if (groups.data.groups.length === 0) {
    return (
      <div>
        <Empty>No groups exist yet.</Empty>
        <CreateGroupForm directory={directory} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="config-group">
        Group
      </label>
      <select
        id="config-group"
        className={inputField}
        value={selected?.kind === 'group' ? selected.id : ''}
        onChange={(event) => {
          const id = event.target.value;
          const group = groups.data.groups.find((candidate) => candidate._id === id);
          if (group) {
            onSelect({ kind: 'group', id: group._id, label: group.name });
          }
        }}
      >
        <option value="">Pick a group…</option>
        {groups.data.groups.map((group) => (
          <option key={group._id} value={group._id}>
            {group.name}
            {group.source ? ` (${group.source})` : ''}
          </option>
        ))}
      </select>
      {groups.data.total > groups.data.groups.length ? (
        <p className="mt-1 text-xs text-slate-500">
          Showing {groups.data.groups.length} of {groups.data.total} groups.
        </p>
      ) : null}
      <CreateGroupForm directory={directory} onSelect={onSelect} />
    </div>
  );
};

export const PrincipalPicker = ({
  directory,
  search,
  kind,
  selected,
  onKindChange,
  onSelect,
}: PrincipalPickerProps) => {
  const handleUser = (user: SelectedUser): void =>
    onSelect({ kind: 'user', id: user.id, label: user.name || user.email || user.id });

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Pick a principal</h2>
        <p className="mb-3 text-sm text-slate-600">
          An override applies to whoever the principal covers. When several apply, the one with the
          highest <span className="font-medium">priority</span> wins.
        </p>
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-slate-700">Principal kind</legend>
          <div className="flex flex-wrap gap-4">
            {KIND_OPTIONS.map((option) => (
              <div key={option.kind} className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  id={`config-principal-${option.kind}`}
                  type="radio"
                  name="config-principal-kind"
                  className="mt-1"
                  value={option.kind}
                  checked={kind === option.kind}
                  onChange={() => onKindChange(option.kind)}
                />
                <label htmlFor={`config-principal-${option.kind}`}>
                  <span className="font-medium text-slate-900">{option.label}</span>
                  <span className="block text-xs text-slate-500">{option.hint}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        {kind === 'role' ? (
          <RoleSelect directory={directory} selected={selected} onSelect={onSelect} />
        ) : null}
        {kind === 'group' ? (
          <GroupSelect directory={directory} selected={selected} onSelect={onSelect} />
        ) : null}
        {kind === 'user' && selected?.kind === 'user' ? (
          <p className="text-sm text-slate-700">
            Editing <span className="font-medium text-slate-900">{selected.label}</span> (
            {selected.id}).{' '}
            <button
              type="button"
              className="text-blue-700 underline"
              onClick={() => onKindChange('user')}
            >
              Pick someone else
            </button>
          </p>
        ) : null}
        {directory.roles.status === 'failed' || directory.groups.status === 'failed' ? (
          <button type="button" className={`${buttonSecondary} mt-3`} onClick={directory.reload}>
            Retry loading roles and groups
          </button>
        ) : null}
      </div>

      {kind === 'user' && selected?.kind !== 'user' ? (
        <SearchPanel
          search={search}
          title="Find the user to override"
          description="Search reaches every user, including those with no config override yet."
          inputId="config-user-search"
          actionLabel="Select"
          onSelect={handleUser}
        />
      ) : null}
    </section>
  );
};
