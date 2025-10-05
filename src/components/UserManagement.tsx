import { useState, useEffect } from 'react';
import { Users, CreditCard as Edit, Trash2, UserPlus, Shield } from 'lucide-react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<'stocktaker' | 'manager' | 'admin'>('stocktaker');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'stocktaker' | 'manager' | 'admin'>('stocktaker');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(userId: string, role: 'stocktaker' | 'manager' | 'admin') {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('id', userId);

      if (error) throw error;

      await loadUsers();
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user role:', error);
      alert('Failed to update user role');
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      await loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  }

  async function createUser() {
    if (!newUserEmail || !newUserPassword || !newUserFullName) {
      alert('Please fill in all fields');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          data: {
            full_name: newUserFullName
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.msg || data.error_description || 'Failed to create user');
      }

      if (data.user?.id) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ role: newUserRole })
          .eq('id', data.user.id);

        if (updateError) throw updateError;
      }

      alert('User created successfully!');
      setShowCreateModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('stocktaker');
      await loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(error.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  function getAvailableRolesForCreation(): ('stocktaker' | 'manager' | 'admin')[] {
    if (profile?.role === 'admin') {
      return ['stocktaker', 'manager', 'admin'];
    }
    if (profile?.role === 'manager') {
      return ['stocktaker'];
    }
    return [];
  }

  function getAvailableRolesForEdit(currentUserRole: string): ('stocktaker' | 'manager' | 'admin')[] {
    if (profile?.role === 'admin') {
      return ['stocktaker', 'manager', 'admin'];
    }
    if (profile?.role === 'manager' && currentUserRole === 'stocktaker') {
      return ['stocktaker'];
    }
    return [];
  }

  const canCreateUsers = profile?.role === 'admin' || profile?.role === 'manager';

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-7 h-7" />
            User Management
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-5 h-5" />
              <span>{users.length} Total Users</span>
            </div>
            {canCreateUsers && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Create User
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Role</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-800">{user.full_name}</p>
                      <p className="text-sm text-gray-500">{user.id.slice(0, 8)}...</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      {getAvailableRolesForEdit(user.role).length > 0 && (
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setNewRole(user.role);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit role"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {profile?.role === 'admin' && (
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12">
            <UserPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Users Found</h3>
            <p className="text-gray-600">Users will appear here once they register</p>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Edit User Role</h3>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold">{editingUser.full_name}</p>
              <p className="text-sm text-gray-600">Current Role: {editingUser.role}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'stocktaker' | 'manager' | 'admin')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {getAvailableRolesForEdit(editingUser.role).map(role => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                {newRole === 'stocktaker' && 'Can create stocktake entries'}
                {newRole === 'manager' && 'Can view all entries, manage variance reports, and create stocktakers'}
                {newRole === 'admin' && 'Full access including user management'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => updateUserRole(editingUser.id, newRole)}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-all"
              >
                Update Role
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="px-6 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Create New User</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role *
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'stocktaker' | 'manager' | 'admin')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {getAvailableRolesForCreation().map(role => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {profile?.role === 'admin' && 'Admins can create stocktakers, managers, and other admins'}
                  {profile?.role === 'manager' && 'Managers can create stocktakers only'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={createUser}
                disabled={creating}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUserEmail('');
                  setNewUserPassword('');
                  setNewUserFullName('');
                  setNewUserRole('stocktaker');
                }}
                disabled={creating}
                className="px-6 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
