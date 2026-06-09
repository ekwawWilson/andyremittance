'use client';
import { useEffect, useState } from 'react';
import { apiClient, User, Permission } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ALL_PERMISSION_KEYS, ROLE_DEFAULTS } from '@/lib/auth/roles';

export default function PermissionsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiClient.getUsers().then((res) => {
      if (res.success && res.data) setUsers(res.data.users);
      setIsLoading(false);
    });
  }, []);

  const loadPermissions = async (u: User) => {
    setSelectedUser(u);
    const res = await apiClient.getPermissions(u.id);
    if (res.success && res.data) setPermissions(res.data);
  };

  const grant = async (key: string) => {
    if (!selectedUser) return;
    setMsg('');
    const res = await apiClient.grantPermission(selectedUser.id, key);
    if (res.success) { setMsg(`Granted: ${key}`); loadPermissions(selectedUser); }
    else { setMsg(res.error || 'Failed'); }
  };

  const revoke = async (key: string) => {
    if (!selectedUser) return;
    setMsg('');
    const res = await apiClient.revokePermission(selectedUser.id, key);
    if (res.success) { setMsg(`Revoked: ${key}`); loadPermissions(selectedUser); }
    else { setMsg(res.error || 'Failed'); }
  };

  // Per-user extra Permission rows from the DB
  const grantedKeys = new Set(permissions.map((p) => p.key));

  // Role defaults for the selected user (greyed, locked)
  const roleDefaults = selectedUser ? new Set(ROLE_DEFAULTS[selectedUser.role] || []) : new Set<string>();

  // Grantable extras: every key NOT already a role default
  const grantableKeys = selectedUser
    ? ALL_PERMISSION_KEYS.filter((k) => !roleDefaults.has(k))
    : [];

  const roleBadge: Record<string, string> = {
    SUPER_ADMIN: 'bg-red-100 text-red-800', ADMIN: 'bg-orange-100 text-orange-800',
    MANAGER: 'bg-blue-100 text-blue-800', TELLER: 'bg-green-100 text-green-800', SENDING_AGENT: 'bg-purple-100 text-purple-800',
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div></div>
  );

  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Permission Management</h1>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.startsWith('Granted') ? 'bg-green-50 border-green-200 text-green-700' : msg.startsWith('Revoked') ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Select User</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left py-3 px-4 text-gray-500">Name</th>
                <th className="text-left py-3 px-4 text-gray-500">Email</th>
                <th className="text-left py-3 px-4 text-gray-500">Role</th>
                <th className="text-left py-3 px-4 text-gray-500">Action</th>
              </tr></thead>
              <tbody>
                {users.filter((u) => u.role !== 'SUPER_ADMIN').map((u) => (
                  <tr key={u.id} className={`border-b last:border-0 ${selectedUser?.id === u.id ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                    <td className="py-3 px-4 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                    <td className="py-3 px-4 text-gray-600">{u.email}</td>
                    <td className="py-3 px-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role]}`}>{u.role}</span></td>
                    <td className="py-3 px-4">
                      <button onClick={() => loadPermissions(u)} className={`text-sm px-3 py-1 rounded-lg ${selectedUser?.id === u.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {selectedUser?.id === u.id ? 'Selected' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle>Permissions for {selectedUser.firstName} {selectedUser.lastName}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[selectedUser.role]}`}>{selectedUser.role}</span>
              {' '}role provides {roleDefaults.size} default permissions. Additional permissions can be granted below.
            </p>
          </CardHeader>
          <CardContent>
            {/* Role defaults — greyed, locked */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Role Defaults</h3>
              <div className="space-y-1.5">
                {[...roleDefaults].map((key) => (
                  <div key={key} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">{key}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Role default</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grantable extras — interactive */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additional Permissions</h3>
              <div className="space-y-1.5">
                {grantableKeys.map((key) => {
                  const has = grantedKeys.has(key);
                  return (
                    <div key={key} className="flex items-center justify-between p-2.5 border rounded-lg">
                      <p className="text-sm font-medium text-gray-900">{key}</p>
                      {has ? (
                        <button onClick={() => revoke(key)} className="text-sm px-3 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200">Revoke</button>
                      ) : (
                        <button onClick={() => grant(key)} className="text-sm px-3 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">Grant</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
