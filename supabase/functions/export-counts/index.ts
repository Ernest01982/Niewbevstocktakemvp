import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toTrimmed(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const eventId = toTrimmed(url.searchParams.get('event_id'));
    const warehouseCode = toTrimmed(url.searchParams.get('warehouse_code'));

    if (!eventId || !warehouseCode) {
      return new Response(JSON.stringify({ error: 'event_id and warehouse_code are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    try {
      await supabase.rpc('refresh_counts_totals_mv');
    } catch (_refreshError) {
      // Non-blocking
    }

    const { data, error: exportError } = await supabase.rpc('export_counts_data', {
      p_event_id: eventId,
      p_warehouse_code: warehouseCode,
    });

    if (exportError) {
      throw new Error(`Failed to load export data: ${exportError.message}`);
    }

    const rows: string[] = ['stock_code,description,lot_number,counted_units'];
    for (const record of data ?? []) {
      rows.push([
        csvEscape(record.stock_code),
        csvEscape(record.description),
        csvEscape(record.lot_number),
        csvEscape(record.counted_units),
      ].join(','));
    }

    const csv = rows.join('\n');
    const filename = `counts-${eventId}-${warehouseCode}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`, 
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Unauthorized'
      ? 401
      : message.includes('permissions') || message.includes('warehouse')
        ? 403
        : 500;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});