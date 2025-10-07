import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_SIZE = 25;

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    const supabase = createClient(getEnv('SB_URL'), getEnv('SB_SERVICE_ROLE_KEY'));

    const { data: pendingCounts, error: pendingError } = await supabase
      .from('counts')
      .select(
        `id, stock_code, lot_number, product_description, extracted_barcode, extracted_product_name,
         extracted_pack_size, extracted_lot_number, extracted_filling_date, photo_path, created_at`
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (pendingError) {
      throw new Error(`Failed to load pending counts: ${pendingError.message}`);
    }

    const processed: string[] = [];
    const updatesFailed: string[] = [];

    for (const row of pendingCounts ?? []) {
      const stockCode = row.stock_code as string;
      const { data: product } = await supabase
        .from('products')
        .select('stock_code, barcode, description, product_name, pack_size')
        .or(`stock_code.eq.${stockCode},barcode.eq.${stockCode}`)
        .maybeSingle();

      const extractedBarcode = nonEmpty(row.extracted_barcode) ?? nonEmpty(product?.barcode ?? null) ?? stockCode;
      const extractedProductName = nonEmpty(row.extracted_product_name) ??
        nonEmpty(row.product_description) ??
        nonEmpty(product?.description ?? product?.product_name ?? null) ?? stockCode;
      const extractedPackSize = nonEmpty(row.extracted_pack_size) ?? nonEmpty(product?.pack_size ?? null) ?? null;
      const extractedLotNumber = nonEmpty(row.extracted_lot_number) ?? nonEmpty(row.lot_number ?? null) ?? null;

      const updatePayload: Record<string, unknown> = {
        status: 'extracted',
        extracted_at: nowIso(),
        extraction_log: [{
          processed_at: nowIso(),
          strategy: 'metadata-fill',
          notes: 'Populated fields from product catalog snapshot (OCR not configured in this environment).',
          product_match: product?.stock_code ?? product?.barcode ?? null,
          photo_available: Boolean(row.photo_path),
        }],
      };

      if (!nonEmpty(row.extracted_barcode ?? null) && extractedBarcode) {
        updatePayload.extracted_barcode = extractedBarcode;
      }
      if (!nonEmpty(row.extracted_product_name ?? null) && extractedProductName) {
        updatePayload.extracted_product_name = extractedProductName;
      }
      if (!nonEmpty(row.extracted_pack_size ?? null) && extractedPackSize) {
        updatePayload.extracted_pack_size = extractedPackSize;
      }
      if (!nonEmpty(row.extracted_lot_number ?? null) && extractedLotNumber) {
        updatePayload.extracted_lot_number = extractedLotNumber;
      }

      const { error: updateError } = await supabase
        .from('counts')
        .update(updatePayload)
        .eq('id', row.id);

      if (updateError) {
        updatesFailed.push(row.id as string);
      } else {
        processed.push(row.id as string);
      }
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stalePhotos, error: staleError } = await supabase
      .from('counts')
      .select('id, photo_path')
      .not('photo_path', 'is', null)
      .lt('created_at', cutoff)
      .limit(100);

    if (staleError) {
      throw new Error(`Failed to load stale photos: ${staleError.message}`);
    }

    const purged: string[] = [];
    for (const record of stalePhotos ?? []) {
      const path = record.photo_path as string | null;
      if (!path) continue;
      const { error: removeError } = await supabase.storage.from('count-images').remove([path]);
      if (!removeError) {
        await supabase.from('counts').update({ photo_path: null }).eq('id', record.id);
        purged.push(record.id as string);
      }
    }

    try {
      await supabase.rpc('refresh_counts_totals_mv');
    } catch (_refreshError) {
      // Ignore refresh issues to keep worker resilient
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed_count: processed.length,
        failed: updatesFailed,
        purged_count: purged.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
