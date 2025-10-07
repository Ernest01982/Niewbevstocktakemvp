import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface WarehouseSummary {
  code: string;
  name: string;
}

function formatWarehouses(assignments: unknown): WarehouseSummary[] {
  if (!Array.isArray(assignments)) {
    return [];
  }

  const seen = new Set<string>();
  const result: WarehouseSummary[] = [];

  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== 'object') {
      continue;
    }

    const nestedWarehouse = (assignment as { warehouses?: unknown }).warehouses as
      | { code?: string; name?: string }
      | undefined;

    const warehouseCode =
      typeof (assignment as { warehouse_code?: unknown }).warehouse_code === 'string'
        ? (assignment as { warehouse_code?: string }).warehouse_code!
        : typeof nestedWarehouse?.code === 'string'
          ? nestedWarehouse.code
          : typeof (assignment as { code?: unknown }).code === 'string'
            ? (assignment as { code?: string }).code!
            : undefined;

    if (!warehouseCode || seen.has(warehouseCode)) {
      continue;
    }

    const warehouseName =
      typeof nestedWarehouse?.name === 'string'
        ? nestedWarehouse.name
        : typeof (assignment as { name?: unknown }).name === 'string'
          ? (assignment as { name?: string }).name!
          : warehouseCode;

    seen.add(warehouseCode);
    result.push({ code: warehouseCode, name: warehouseName.trim() || warehouseCode });
  }

  return result;
}

function formatUserRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
    warehouses: formatWarehouses((row as { user_warehouse_assignments?: unknown }).user_warehouse_assignments),
  };
}

async function getManagerWarehouseCodes(
  supabase: ReturnType<typeof createClient>,
  managerId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_warehouse_assignments')
    .select('warehouse_code')
    .eq('user_id', managerId);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((assignment) => assignment?.warehouse_code)
    .filter((code): code is string => typeof code === 'string' && code.trim().length > 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    if (profile.role !== 'admin' && profile.role !== 'manager') {
      throw new Error('Insufficient permissions');
    }

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    if (req.method === 'GET' && path === 'admin-user-management') {
      if (profile.role === 'admin') {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(`
            id,
            full_name,
            role,
            created_at,
            updated_at,
            user_warehouse_assignments (
              warehouse_code,
              warehouses ( code, name )
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted = (data ?? []).map((row) => formatUserRow(row as Record<string, unknown>));

        return new Response(JSON.stringify(formatted), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }

      const managerWarehouseCodes = await getManagerWarehouseCodes(supabase, user.id);
      const userIds = new Set<string>([user.id]);

      if (managerWarehouseCodes.length > 0) {
        const { data: assignmentRows, error: assignmentError } = await supabase
          .from('user_warehouse_assignments')
          .select('user_id')
          .in('warehouse_code', managerWarehouseCodes);

        if (assignmentError) throw assignmentError;

        for (const assignment of assignmentRows ?? []) {
          const assignedUserId = assignment?.user_id as string | undefined;
          if (assignedUserId) {
            userIds.add(assignedUserId);
          }
        }
      }

      const { data: managerUsers, error: managerError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          full_name,
          role,
          created_at,
          updated_at,
          user_warehouse_assignments (
            warehouse_code,
            warehouses ( code, name )
          )
        `)
        .in('id', Array.from(userIds));

      if (managerError) throw managerError;

      const filtered = (managerUsers ?? []).filter((row) => row.id === user.id || row.role === 'stocktaker');
      const formatted = filtered.map((row) => formatUserRow(row as Record<string, unknown>));

      return new Response(JSON.stringify(formatted), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (req.method === 'PUT') {
      const { userId, role, warehouseCodes } = await req.json();

      if (!userId) {
        throw new Error('Missing userId');
      }

      const { data: targetUser, error: targetError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (targetError || !targetUser) {
        throw new Error('User not found');
      }

      if (profile.role === 'manager') {
        if (targetUser.role !== 'stocktaker') {
          throw new Error('Managers can only manage stocktakers');
        }

        if (role && role !== 'stocktaker') {
          throw new Error('Managers can only assign stocktaker role');
        }
      }

      if (role && role !== targetUser.role) {
        const { error: updateRoleError } = await supabase
          .from('user_profiles')
          .update({ role })
          .eq('id', userId);

        if (updateRoleError) throw updateRoleError;
      }

      const nextRole = (role ?? targetUser.role) as 'stocktaker' | 'manager' | 'admin';

      if (Array.isArray(warehouseCodes)) {
        const sanitizedCodes = Array.from(
          new Set(
            warehouseCodes.filter((code: unknown): code is string => typeof code === 'string' && code.trim().length > 0)
          )
        );

        let finalCodes = sanitizedCodes;

        if (profile.role === 'manager') {
          const allowedCodes = new Set(await getManagerWarehouseCodes(supabase, user.id));
          finalCodes = sanitizedCodes.filter((code) => allowedCodes.has(code));

          if (finalCodes.length === 0) {
            throw new Error('Managers must assign at least one of their warehouses');
          }
        }

        if (nextRole !== 'admin' && finalCodes.length === 0) {
          throw new Error('At least one warehouse is required for this role');
        }

        const { error: deleteAssignmentsError } = await supabase
          .from('user_warehouse_assignments')
          .delete()
          .eq('user_id', userId);

        if (deleteAssignmentsError) throw deleteAssignmentsError;

        if (finalCodes.length > 0) {
          const rows = finalCodes.map((code) => ({ user_id: userId, warehouse_code: code }));
          const { error: upsertError } = await supabase
            .from('user_warehouse_assignments')
            .upsert(rows, { onConflict: 'user_id,warehouse_code' });

          if (upsertError) throw upsertError;
        }
      }

      const { data: refreshedUser, error: refreshedError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          full_name,
          role,
          created_at,
          updated_at,
          user_warehouse_assignments (
            warehouse_code,
            warehouses ( code, name )
          )
        `)
        .eq('id', userId)
        .single();

      if (refreshedError || !refreshedUser) throw refreshedError;

      return new Response(JSON.stringify(formatUserRow(refreshedUser as Record<string, unknown>)), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (req.method === 'DELETE') {
      if (profile.role !== 'admin') {
        throw new Error('Only admins can delete users');
      }

      const { userId } = await req.json();

      if (!userId) {
        throw new Error('Missing userId');
      }

      const { error: deleteProfileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) throw deleteProfileError;

      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

      if (deleteAuthError) throw deleteAuthError;

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    throw new Error('Method not allowed');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: message === 'Unauthorized' || message === 'Insufficient permissions' ? 403 : 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});