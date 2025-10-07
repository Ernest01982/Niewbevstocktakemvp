import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AssignPayloadItem {
  stock_code?: string;
  lot_number?: string | null;
  notes?: string | null;
}

interface AssignPayload {
  event_id?: string;
  warehouse_code?: string;
  items?: AssignPayloadItem[];
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toTrimmed(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function rotateStartIndex(assignments: string[], lastAssigned: string | null): number {
  if (!lastAssigned) return 0;
  const idx = assignments.indexOf(lastAssigned);
  return idx === -1 ? 0 : (idx + 1) % assignments.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as AssignPayload;
    const eventId = toTrimmed(payload.event_id);
    const warehouseCode = toTrimmed(payload.warehouse_code);
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!eventId) {
      throw new Error('event_id is required');
    }
    if (!warehouseCode) {
      throw new Error('warehouse_code is required');
    }
    if (items.length === 0) {
      throw new Error('At least one item is required');
    }

    const supabase = createClient(getEnv('SB_URL'), getEnv('SB_SERVICE_ROLE_KEY'));
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: authResult, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authResult?.user) {
      throw new Error('Unauthorized');
    }

    const userId = authResult.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    const role = profile.role as string;
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';

    if (!isAdmin && !isManager) {
      throw new Error('Insufficient permissions');
    }

    if (!isAdmin) {
      const { data: assignment, error: assignmentError } = await supabase
        .from('user_warehouse_assignments')
        .select('warehouse_code')
        .eq('user_id', userId)
        .eq('warehouse_code', warehouseCode)
        .maybeSingle();

      if (assignmentError || !assignment) {
        throw new Error('You are not assigned to this warehouse');
      }
    }

    const { data: warehouseAssignments, error: assignmentLoadError } = await supabase
      .from('user_warehouse_assignments')
      .select('user_id')
      .eq('warehouse_code', warehouseCode);

    if (assignmentLoadError) {
      throw new Error(`Failed to load warehouse assignments: ${assignmentLoadError.message}`);
    }

    const uniqueUserIds = Array.from(
      new Set((warehouseAssignments ?? []).map((record) => record.user_id).filter((id): id is string => typeof id === 'string')),
    );

    if (uniqueUserIds.length === 0) {
      throw new Error('No users are assigned to this warehouse');
    }

    const { data: takerProfiles, error: takerError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', 'stock_taker')
      .in('id', uniqueUserIds);

    if (takerError) {
      throw new Error(`Failed to load stock taker profiles: ${takerError.message}`);
    }

    const eligible = (takerProfiles ?? [])
      .map((profile) => profile.id as string)
      .filter((id) => typeof id === 'string');

    if (eligible.length === 0) {
      throw new Error('No stock takers are assigned to this warehouse');
    }

    const { data: lastTask } = await supabase
      .from('recount_tasks')
      .select('assigned_to')
      .eq('event_id', eventId)
      .eq('warehouse_code', warehouseCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const startIndex = rotateStartIndex(eligible, lastTask?.assigned_to ?? null);
    const assignments: { index: number; userId: string }[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const userIdForTask = eligible[(startIndex + i) % eligible.length];
      assignments.push({ index: i, userId: userIdForTask });
    }

    const rowsToInsert = assignments.map(({ index, userId: assignedTo }) => {
      const item = items[index];
      const stockCode = toTrimmed(item?.stock_code);
      if (!stockCode) {
        throw new Error(`Item at position ${index} is missing stock_code`);
      }

      return {
        event_id: eventId,
        warehouse_code: warehouseCode,
        stock_code: stockCode,
        lot_number: toTrimmed(item?.lot_number),
        notes: toTrimmed(item?.notes),
        assigned_to: assignedTo,
        assigned_by: userId,
        status: 'pending',
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('recount_tasks')
      .insert(rowsToInsert)
      .select('id, stock_code, lot_number, assigned_to, status');

    if (insertError) {
      throw new Error(`Failed to create tasks: ${insertError.message}`);
    }

    return new Response(JSON.stringify({ ok: true, tasks: inserted ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Unauthorized'
      ? 401
      : message.includes('permissions') || message.includes('warehouse')
        ? 403
        : 400;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
