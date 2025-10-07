import { useState, useEffect, useCallback } from 'react';
import { Users, CreditCard as Edit, Trash2, UserPlus, Shield, Eye, EyeOff } from 'lucide-react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface WarehouseSummary {
  code: string;
  name: string;
}

type ManagedUser = UserProfile & { warehouses?: WarehouseSummary[] };

export default function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [newRole, setNewRole] = useState<'stocktaker' | 'manager' | 'admin'>('stocktaker');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'stocktaker' | 'manager' | 'admin'>('stocktaker');
  const [creating, setCreating] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [availableWarehouses, setAvailableWarehouses] = useState<WarehouseSummary[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [newUserWarehouses, setNewUserWarehouses] = useState<string[]>([]);
  const [editingUserWarehouses, setEditingUserWarehouses] = useState<string[]>([]);
  const [managerAssignedCodes, setManagerAssignedCodes] = useState<string[]>([]);

  const sanitizeWarehouseSelection = useCallback(
    (selection: string[]) => {
      const allowedCodes = new Set(
        availableWarehouses.map((warehouse) => warehouse.code).filter((code): code is string => Boolean(code))
      );

      if (allowedCodes.size === 0) {
        return [];
      }

      const uniqueSelection = new Set(selection.filter((code): code is string => Boolean(code)));
      return Array.from(uniqueSelection).filter((code) => allowedCodes.has(code));
    },
    [availableWarehouses]
  );

  function normalizeWarehousesFromUser(user: unknown): WarehouseSummary[] {
    if (!user || typeof user !== 'object') {
      return [];
    }

    const rawAssignments = Array.isArray((user as { warehouses?: unknown }).warehouses)
      ? ((user as { warehouses?: unknown }).warehouses as unknown[])
      : Array.isArray((user as { user_warehouse_assignments?: unknown }).user_warehouse_assignments)
        ? ((user as { user_warehouse_assignments?: unknown }).user_warehouse_assignments as unknown[])
        : [];

    return rawAssignments
      .map((assignment) => {
        if (!assignment || typeof assignment !== 'object') {
          return null;
        }

        const nestedWarehouse = (assignment as { warehouses?: unknown }).warehouses;
        const nestedCode =
          typeof (assignment as { code?: unknown }).code === 'string'
            ? (assignment as { code?: string }).code
            : typeof (assignment as { warehouse_code?: unknown }).warehouse_code === 'string'
              ? (assignment as { warehouse_code?: string }).warehouse_code
              : typeof (nestedWarehouse as { code?: unknown } | undefined)?.code === 'string'
                ? (nestedWarehouse as { code: string }).code
                : undefined;

        if (!nestedCode) {
          return null;
        }

        const nestedNameRaw =
          typeof (assignment as { name?: unknown }).name === 'string'
            ? (assignment as { name?: string }).name
            : typeof (nestedWarehouse as { name?: unknown } | undefined)?.name === 'string'
              ? (nestedWarehouse as { name: string }).name
              : nestedCode;

        const nestedName = (nestedNameRaw ?? nestedCode).trim() || nestedCode;

        return { code: nestedCode, name: nestedName };
      })
      .filter((assignment): assignment is WarehouseSummary => Boolean(assignment?.code));
  }

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'An unexpected error occurred';
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);

      if (profile?.role === 'admin' || profile?.role === 'manager') {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('No active session');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorBody = (await response.json()) as { error?: string };
          throw new Error(errorBody.error || 'Failed to load users');
        }

        const data = (await response.json()) as Array<ManagedUser | { user_warehouse_assignments?: unknown }> | null;
        const normalized = (data ?? []).map((user) => ({
          ...user,
          warehouses: normalizeWarehousesFromUser(user),
        }));
        setUsers(normalized);
      } else {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', profile?.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const { data: assignments, error: assignmentsError } = await supabase
          .from('user_warehouse_assignments')
          .select('warehouse_code, warehouses ( code, name )')
          .eq('user_id', profile?.id);

        if (assignmentsError) throw assignmentsError;

        const assignmentWarehouses = normalizeWarehousesFromUser({ user_warehouse_assignments: assignments });

        setUsers(
          (data || []).map((user) => ({
            ...user,
            warehouses: assignmentWarehouses,
          }))
        );
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    let isActive = true;

    async function loadWarehousesForUser() {
      if (!profile) {
        return;
      }

      try {
        setLoadingWarehouses(true);

        let assignedCodes: string[] = [];

        if (profile.role === 'manager' || profile.role === 'stocktaker') {
          const { data: assignments, error: assignmentsError } = await supabase
            .from('user_warehouse_assignments')
            .select('warehouse_code')
            .eq('user_id', profile.id);

          if (assignmentsError) throw assignmentsError;

          assignedCodes = (assignments ?? [])
            .map((assignment) => assignment.warehouse_code as string | null)
            .filter((code): code is string => Boolean(code));

          if (profile.role === 'manager' && isActive) {
            setManagerAssignedCodes(assignedCodes);
          }
        } else if (isActive) {
          setManagerAssignedCodes([]);
        }

        let warehouseQuery = supabase
          .from('warehouses')
          .select('code, name')
          .order('name', { ascending: true });

        if (profile.role === 'manager') {
          if (assignedCodes.length === 0) {
            if (isActive) {
              setAvailableWarehouses([]);
            }
            return;
          }

          warehouseQuery = warehouseQuery.in('code', assignedCodes);
        }

        const { data: warehouseRows, error: warehousesError } = await warehouseQuery;

        if (warehousesError) throw warehousesError;

        const mapped = (warehouseRows ?? [])
          .map((row) => ({
            code: (row.code as string) ?? '',
            name: ((row.name as string) ?? (row.code as string) ?? '').trim() || 'Unnamed warehouse'
          }))
          .filter((warehouse) => warehouse.code);

        if (isActive) {
          setAvailableWarehouses(mapped);
        }
      } catch (error) {
        console.error('Error loading warehouses:', error);
        if (isActive) {
          setAvailableWarehouses([]);
        }
      } finally {
        if (isActive) {
          setLoadingWarehouses(false);
        }
      }
    }

    loadWarehousesForUser();

    return () => {
      isActive = false;
    };
  }, [profile]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function updateUserRole(userId: string, role: 'stocktaker' | 'manager' | 'admin', warehouseCodes: string[]) {
    const sanitizedSelection = sanitizeWarehouseSelection(warehouseCodes);

    if (canAssignWarehouses && role !== 'admin' && sanitizedSelection.length === 0) {
      alert('Assign at least one warehouse to this user.');
      return;
    }

    try {
      await syncUserDetails({ userId, role, warehouseCodes: sanitizedSelection });
      await loadUsers();
      setEditingUser(null);
      setEditingUserWarehouses([]);
    } catch (error: unknown) {
      console.error('Error updating user role:', error);
      alert(getErrorMessage(error));
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete user');
      }

      await loadUsers();
    } catch (error: unknown) {
      console.error('Error deleting user:', error);
      alert(getErrorMessage(error));
    }
  }

  async function syncUserDetails({
    userId,
    role,
    warehouseCodes
  }: {
    userId: string;
    role?: 'stocktaker' | 'manager' | 'admin';
    warehouseCodes?: string[];
  }) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        role,
        warehouseCodes,
      }),
    });

    const payload = (await response.json()) as { error?: string } | ManagedUser;

    if (!response.ok) {
      throw new Error((payload as { error?: string }).error || 'Failed to update user');
    }

    return payload as ManagedUser;
  }

  async function createUser() {
    if (!newUserEmail || !newUserPassword || !newUserFullName) {
      alert('Please fill in all fields');
      return;
    }

    const canAssign = profile?.role === 'admin' || profile?.role === 'manager';
    const baseSelection =
      profile?.role === 'manager' && newUserWarehouses.length === 0
        ? managerAssignedCodes
        : newUserWarehouses;
    const warehouseSelection = canAssign ? sanitizeWarehouseSelection(baseSelection) : [];

    if (canAssign && newUserRole !== 'admin' && warehouseSelection.length === 0) {
      alert('Please select at least one warehouse for the new user.');
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

      const data = (await response.json()) as {
        user?: { id?: string };
        msg?: string;
        error_description?: string;
      };

      if (!response.ok) {
        throw new Error(data.msg || data.error_description || 'Failed to create user');
      }

      if (data.user?.id) {
        await syncUserDetails({
          userId: data.user.id,
          role: newUserRole,
          warehouseCodes: warehouseSelection
        });
      }

      alert('User created successfully!');
      setShowCreateModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('stocktaker');
      setNewUserWarehouses(
        profile?.role === 'manager'
          ? sanitizeWarehouseSelection(managerAssignedCodes)
          : []
      );
      await loadUsers();
    } catch (error: unknown) {
      console.error('Error creating user:', error);
      alert(getErrorMessage(error));
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
  const canAssignWarehouses = canCreateUsers;
  const managerCanCreate = profile?.role !== 'manager' || managerAssignedCodes.length > 0;

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
      {profile?.role === 'manager' && !loadingWarehouses && managerAssignedCodes.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 text-sm">
          You must be assigned to at least one warehouse before you can create stocktakers.
          Please contact an administrator to assign a warehouse to your account.
        </div>
      )}

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
                onClick={() => {
                  setNewUserWarehouses(
                    profile?.role === 'manager'
                      ? sanitizeWarehouseSelection(managerAssignedCodes)
                      : []
                  );
                  setShowCreateModal(true);
                }}
                disabled={!managerCanCreate || (profile?.role === 'manager' && loadingWarehouses)}
                className={`bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  !managerCanCreate || (profile?.role === 'manager' && loadingWarehouses)
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-blue-700'
                }`}
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Warehouses</th>
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
                  <td className="py-3 px-4">
                    {user.warehouses && user.warehouses.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {user.warehouses.map((warehouse) => (
                          <span
                            key={`${user.id}-${warehouse.code}`}
                            className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700"
                          >
                            {warehouse.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Not assigned</span>
                    )}
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
                            setEditingUserWarehouses(
                              sanitizeWarehouseSelection(
                                (user.warehouses ?? []).map((warehouse) => warehouse.code)
                              )
                            );
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

            {canAssignWarehouses && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Warehouse Access
                </label>
                {availableWarehouses.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No warehouses available to assign.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {availableWarehouses.map((warehouse) => {
                      const isChecked = editingUserWarehouses.includes(warehouse.code);
                      const disabled =
                        profile?.role === 'manager' && !managerAssignedCodes.includes(warehouse.code);

                      return (
                        <label
                          key={`edit-${warehouse.code}`}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                            disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={isChecked}
                            disabled={disabled}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setEditingUserWarehouses((prev) => sanitizeWarehouseSelection([...prev, warehouse.code]));
                              } else {
                                setEditingUserWarehouses((prev) => prev.filter((code) => code !== warehouse.code));
                              }
                            }}
                          />
                          <span className="font-medium text-gray-700">{warehouse.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Assign the warehouses this user can access.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() =>
                  updateUserRole(
                    editingUser.id,
                    newRole,
                    sanitizeWarehouseSelection(editingUserWarehouses)
                  )
                }
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-all"
              >
                Update Role
              </button>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setEditingUserWarehouses([]);
                }}
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
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Minimum 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
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

              {canAssignWarehouses && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Warehouses *
                  </label>
                  {loadingWarehouses ? (
                    <p className="text-sm text-gray-500">Loading warehouses...</p>
                  ) : availableWarehouses.length === 0 ? (
                    <p className="text-sm text-gray-500">No warehouses available.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {availableWarehouses.map((warehouse) => {
                        const disabled =
                          profile?.role === 'manager' && !managerAssignedCodes.includes(warehouse.code);
                        const isChecked = newUserWarehouses.includes(warehouse.code);

                        return (
                          <label
                            key={`new-${warehouse.code}`}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                              disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'border-gray-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={isChecked}
                              disabled={disabled}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setNewUserWarehouses((prev) => sanitizeWarehouseSelection([...prev, warehouse.code]));
                                } else {
                                  setNewUserWarehouses((prev) => prev.filter((code) => code !== warehouse.code));
                                }
                              }}
                            />
                            <span className="font-medium text-gray-700">{warehouse.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    Select the warehouses this user should have access to.
                  </p>
                </div>
              )}
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
                  setNewUserWarehouses(
                    profile?.role === 'manager'
                      ? sanitizeWarehouseSelection(managerAssignedCodes)
                      : []
                  );
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
