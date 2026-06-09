'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, User } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { PERMISSION_CATEGORIES, PERMISSION_INFO, ROLE_DEFAULTS } from '@/lib/auth/roles';

const ELEVATED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'];

const ALL_ROLES = [
  { value: 'SENDING_AGENT',   label: 'Sending Agent' },
  { value: 'TELLER',          label: 'Teller' },
  { value: 'MANAGER',         label: 'Manager' },
  { value: 'RECEIVING_ADMIN', label: 'Receiving Admin' },
  { value: 'SENDING_ADMIN',   label: 'Sending Admin' },
  { value: 'ADMIN',           label: 'Admin' },
  { value: 'SUPER_ADMIN',     label: 'Super Admin' },
];

const BRANCH_ROLES = ['TELLER', 'MANAGER', 'RECEIVING_ADMIN'];

const roleBadge: Record<string, string> = {
  SUPER_ADMIN:     'bg-red-100 text-red-800',
  ADMIN:           'bg-orange-100 text-orange-800',
  RECEIVING_ADMIN: 'bg-teal-100 text-teal-800',
  SENDING_ADMIN:   'bg-indigo-100 text-indigo-800',
  MANAGER:         'bg-blue-100 text-blue-800',
  TELLER:          'bg-green-100 text-green-800',
  SENDING_AGENT:   'bg-purple-100 text-purple-800',
};

type EditForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  receivingPointId: string;
  password: string;
  isActive: boolean;
};

const emptyEdit = (): EditForm => ({
  firstName: '', lastName: '', email: '', phone: '',
  role: 'SENDING_AGENT', receivingPointId: '', password: '', isActive: true,
});

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [points, setPoints] = useState<Array<{ id: string; name: string }>>([]);

  // ── Create modal ──────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'SENDING_AGENT', receivingPointId: '' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit());
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Deactivate confirmation ───────────────────────────────────────────────
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // ── Permissions modal ─────────────────────────────────────────────────────
  const [permUser, setPermUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const refreshUsers = () =>
    apiClient.getUsers().then((r) => { if (r.success && r.data) setUsers(r.data.users); });

  useEffect(() => {
    apiClient.getUsers().then((res) => { if (res.success && res.data) setUsers(res.data.users); setIsLoading(false); });
    apiClient.getReceivingPoints().then((res) => { if (res.success && res.data) setPoints(res.data); });
  }, []);

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    const res = await apiClient.createUser({ ...createForm, receivingPointId: createForm.receivingPointId || undefined } as Parameters<typeof apiClient.createUser>[0]);
    setCreateLoading(false);
    if (res.success) {
      setShowCreate(false);
      setCreateForm({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'SENDING_AGENT', receivingPointId: '' });
      refreshUsers();
    } else {
      setCreateError(res.error || 'Failed to create user');
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({
      firstName:        u.firstName,
      lastName:         u.lastName,
      email:            u.email,
      phone:            u.phone ?? '',
      role:             u.role,
      receivingPointId: u.receivingPoint?.id ?? '',
      password:         '',
      isActive:         u.isActive,
    });
    setEditError('');
    setShowPassword(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError('');
    setEditLoading(true);

    const payload: Record<string, unknown> = {
      firstName:        editForm.firstName,
      lastName:         editForm.lastName,
      email:            editForm.email,
      phone:            editForm.phone || null,
      role:             editForm.role,
      receivingPointId: editForm.receivingPointId || null,
      isActive:         editForm.isActive,
    };
    if (editForm.password) payload.password = editForm.password;

    const res = await apiClient.updateUser(editUser.id, payload as Parameters<typeof apiClient.updateUser>[1]);
    setEditLoading(false);
    if (res.success) {
      setEditUser(null);
      refreshUsers();
    } else {
      setEditError(res.error || 'Failed to update user');
    }
  };

  // ── Deactivate ────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!deactivateUser) return;
    setDeactivateLoading(true);
    const res = await apiClient.deactivateUser(deactivateUser.id);
    setDeactivateLoading(false);
    if (res.success) {
      setDeactivateUser(null);
      refreshUsers();
    }
  };

  // ── Permissions ───────────────────────────────────────────────────────────
  const openPermissions = async (u: User) => {
    setPermUser(u);
    setPermLoading(true);
    const res = await apiClient.getUserPermissions(u.id);
    if (res.success && res.data) setUserPermissions(res.data.permissions);
    setPermLoading(false);
  };

  const togglePermission = (key: string) =>
    setUserPermissions((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);

  const savePermissions = async () => {
    if (!permUser) return;
    setPermSaving(true);
    const res = await apiClient.updateUserPermissions(permUser.id, userPermissions);
    if (res.success) setPermUser(null);
    setPermSaving(false);
  };

  const isRoleDefault = (key: string) => permUser ? (ROLE_DEFAULTS[permUser.role]?.includes(key) ?? false) : false;

  const canEdit = (u: User) =>
    u.role !== 'SUPER_ADMIN' && (!ELEVATED_ROLES.includes(u.role) || isSuperAdmin);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Users</h1>
        <Button onClick={() => setShowCreate(true)}>Add User</Button>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-gray-100">
                {users.length === 0 ? (
                  <p className="text-center py-10 text-gray-400 text-sm">No users found.</p>
                ) : users.map((u) => (
                  <div key={u.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{u.firstName} {u.lastName}</p>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role]}`}>{u.role.replace(/_/g, ' ')}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                        {u.receivingPoint && <p className="text-xs text-gray-400">{u.receivingPoint.name}</p>}
                      </div>
                      {canEdit(u) && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => openEdit(u)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition-colors">Edit</button>
                          <button type="button" onClick={() => openPermissions(u)} className="text-xs px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium transition-colors">Perms</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Role</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Branch</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Last Login</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                        <td className="py-3 px-4 text-gray-600">{u.email}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role]}`}>{u.role.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{u.receivingPoint?.name || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-GH') : '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {canEdit(u) && (
                              <>
                                <button type="button" onClick={() => openEdit(u)} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition-colors">Edit</button>
                                <button type="button" onClick={() => openPermissions(u)} className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium transition-colors">Permissions</button>
                                {u.id !== currentUser?.id && u.isActive && (
                                  <button type="button" onClick={() => setDeactivateUser(u)} className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors">Deactivate</button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <p className="text-center py-10 text-gray-400 text-sm">No users found.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create User Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create User">
        <form onSubmit={handleCreate} className="space-y-3">
          {createError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{createError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input id="cfn" label="First Name" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required />
            <Input id="cln" label="Last Name"  value={createForm.lastName}  onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}  required />
          </div>
          <Input id="cem" label="Email"    type="email"    value={createForm.email}    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}    required />
          <Input id="cpw" label="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
          <Input id="cph" label="Phone (optional)" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          <Select id="crole" label="Role" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value, receivingPointId: '' })}
            options={ALL_ROLES.filter((r) => isSuperAdmin || !ELEVATED_ROLES.includes(r.value) || r.value === 'SENDING_ADMIN')} />
          <Select
            id="cbranch"
            label={BRANCH_ROLES.includes(createForm.role) ? 'Branch *' : 'Branch (optional)'}
            value={createForm.receivingPointId}
            onChange={(e) => setCreateForm({ ...createForm, receivingPointId: e.target.value })}
            options={[{ value: '', label: BRANCH_ROLES.includes(createForm.role) ? 'Select branch…' : 'No branch' }, ...points.map((p) => ({ value: p.id, label: p.name }))]}
            required={BRANCH_ROLES.includes(createForm.role)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" isLoading={createLoading}>Create User</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit User Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Edit User — ${editUser?.firstName} ${editUser?.lastName}`} size="md">
        {editUser && (
          <form onSubmit={handleEdit} className="space-y-3">
            {editError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{editError}</div>
            )}

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <Input id="efn" label="First Name" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required />
              <Input id="eln" label="Last Name"  value={editForm.lastName}  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}  required />
            </div>

            {/* Email */}
            <Input id="eem" label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />

            {/* Phone */}
            <Input id="eph" label="Phone (optional)" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />

            {/* Role */}
            <Select
              id="erole"
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value, receivingPointId: '' })}
              options={ALL_ROLES.filter((r) => isSuperAdmin || !ELEVATED_ROLES.includes(r.value) || r.value === 'SENDING_ADMIN')}
            />

            {/* Branch — shown for all roles */}
            <Select
              id="ebranch"
              label={BRANCH_ROLES.includes(editForm.role) ? 'Branch *' : 'Branch (optional)'}
              value={editForm.receivingPointId}
              onChange={(e) => setEditForm({ ...editForm, receivingPointId: e.target.value })}
              options={[{ value: '', label: BRANCH_ROLES.includes(editForm.role) ? 'Select branch…' : 'No branch' }, ...points.map((p) => ({ value: p.id, label: p.name }))]}
              required={BRANCH_ROLES.includes(editForm.role)}
            />

            {/* Status toggle */}
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-800">Account Status</p>
                <p className="text-xs text-gray-500 mt-0.5">Inactive users cannot log in</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={editForm.isActive}
                onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${editForm.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Password reset section */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span>Reset Password</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showPassword ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showPassword && (
                <div className="p-3 border-t border-gray-200">
                  <Input
                    id="epw"
                    label="New Password (min 6 chars)"
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" isLoading={editLoading}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Deactivate Confirmation Modal ─────────────────────────────────── */}
      <Modal isOpen={!!deactivateUser} onClose={() => setDeactivateUser(null)} title="Deactivate User" size="sm">
        {deactivateUser && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
              <p className="font-semibold mb-1">Are you sure you want to deactivate this user?</p>
              <p><strong>{deactivateUser.firstName} {deactivateUser.lastName}</strong> ({deactivateUser.email})</p>
              <p className="mt-2 text-red-600 text-xs">They will no longer be able to log in. This can be reversed by editing the user and toggling the status back to Active.</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeactivateUser(null)}>Cancel</Button>
              <Button onClick={handleDeactivate} isLoading={deactivateLoading} className="bg-red-600 hover:bg-red-700 text-white">
                Deactivate
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Permissions Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={!!permUser} onClose={() => setPermUser(null)} title={`Permissions — ${permUser?.firstName} ${permUser?.lastName}`} size="lg">
        {permUser && (
          <div>
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{permUser.email}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Role:{' '}
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[permUser.role]}`}>
                      {permUser.role.replace(/_/g, ' ')}
                    </span>
                  </p>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <p className="text-blue-500">Blue = role default (locked)</p>
                  <p className="text-emerald-600">Green = custom grant</p>
                </div>
              </div>
            </div>

            {permUser.role === 'SENDING_ADMIN' && (
              <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800">
                <strong>Sending Admin:</strong> You can grant agent-level permissions so this admin can also operate as a sending agent.
              </div>
            )}

            {permLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                {Object.entries(PERMISSION_CATEGORIES).map(([category, keys]) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">{category}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {keys.map((key) => {
                        const info = PERMISSION_INFO[key] || { label: key, description: '' };
                        const isDefault = isRoleDefault(key);
                        const hasPermission = userPermissions.includes(key) || isDefault;
                        return (
                          <label
                            key={key}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              hasPermission
                                ? isDefault ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={hasPermission}
                              onChange={() => !isDefault && togglePermission(key)}
                              disabled={isDefault}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${hasPermission ? (isDefault ? 'text-blue-900' : 'text-emerald-900') : 'text-gray-700'}`}>
                                {info.label}
                                {isDefault && <span className="ml-2 text-xs font-normal text-blue-500">(role default)</span>}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{info.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <Button variant="secondary" type="button" onClick={() => setPermUser(null)}>Cancel</Button>
              <Button type="button" onClick={savePermissions} isLoading={permSaving}>Save Permissions</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
