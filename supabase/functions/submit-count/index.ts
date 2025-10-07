import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PackagingSnapshot {
  unitsPerCase: number;
  casesPerLayer: number;
  layersPerPallet: number;
  packSize: string;
  description: string;
}

interface SubmitCountPayload {
  event_id?: string;
  warehouse_code?: string;
  stock_code?: string;
  lot_number?: string | null;
  product_description?: string | null;
  description?: string | null;
  photo_base64?: string | null;
  [key: string]: unknown;
}

interface UploadedPhoto {
  data: Uint8Array;
  contentType: string;
  name: string;
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function readNumber(payload: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (key in payload) {
      const raw = payload[key];
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (value === '' || value === null || value === undefined) {
        continue;
      }
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }
  }
  return 0;
}

function decodeBase64Image(base64: string): UploadedPhoto {
  const matches = base64.match(/^data:(?<type>[^;,]+);base64,(?<data>.+)$/);
  const contentType = matches?.groups?.type ?? 'image/jpeg';
  const dataPart = matches?.groups?.data ?? base64;
  const binary = Uint8Array.from(atob(dataPart), (c) => c.charCodeAt(0));
  return {
    data: binary,
    contentType,
    name: `upload.${contentType.split('/').pop() ?? 'jpg'}`,
  };
}

async function readMultipartPayload(req: Request): Promise<{ payload: SubmitCountPayload; photo: UploadedPhoto | null }>
{ // deno-fmt-ignore-line
  const formData = await req.formData();
  const payload: SubmitCountPayload = {};
  let photo: UploadedPhoto | null = null;

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (key === 'photo') {
        const buffer = new Uint8Array(await value.arrayBuffer());
        photo = {
          data: buffer,
          contentType: value.type || 'image/jpeg',
          name: value.name || 'photo.jpg',
        };
      }
      continue;
    }

    payload[key] = value;
  }

  return { payload, photo };
}

async function readJsonPayload(req: Request): Promise<{ payload: SubmitCountPayload; photo: UploadedPhoto | null }>
{ // deno-fmt-ignore-line
  const payload = (await req.json()) as SubmitCountPayload;
  const photoBase64 = typeof payload.photo_base64 === 'string' ? payload.photo_base64 : null;
  const photo = photoBase64 ? decodeBase64Image(photoBase64) : null;
  if (photoBase64) {
    delete payload.photo_base64;
  }
  return { payload, photo };
}

function computeTotalUnits(
  singlesUnits: number,
  singlesCases: number,
  pickFaceLayers: number,
  pickFaceCases: number,
  bulkPallets: number,
  bulkLayers: number,
  bulkCases: number,
  packaging: PackagingSnapshot,
): number {
  const unitsPerCase = Math.max(1, packaging.unitsPerCase || 1);
  const casesPerLayer = Math.max(1, packaging.casesPerLayer || 1);
  const layersPerPallet = Math.max(1, packaging.layersPerPallet || 1);

  const singlesTotal = singlesUnits + singlesCases * unitsPerCase;
  const pickFaceTotal = pickFaceLayers * (unitsPerCase * casesPerLayer) + pickFaceCases * unitsPerCase;
  const bulkTotal =
    bulkPallets * (unitsPerCase * casesPerLayer * layersPerPallet) +
    bulkLayers * (unitsPerCase * casesPerLayer) +
    bulkCases * unitsPerCase;

  return singlesTotal + pickFaceTotal + bulkTotal;
}

Deno.serve(async (req: Request) => {
  console.log('submit-count function started');

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
    const contentType = req.headers.get('content-type') ?? '';
    const { payload, photo } = contentType.includes('multipart/form-data')
      ? await readMultipartPayload(req)
      : await readJsonPayload(req);

    const supabaseUrl = getEnv('SB_URL');
    const supabaseServiceKey = getEnv('SB_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: authResult, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authResult?.user) {
      throw new Error('Unauthorized');
    }

    const user = authResult.user;
    const eventId = toTrimmedString(payload.event_id);
    const warehouseCode = toTrimmedString(payload.warehouse_code);
    const stockCode = toTrimmedString(payload.stock_code);

    console.log(`Processing count for user ${user.id} in event ${eventId} and warehouse ${warehouseCode}`);

    if (!eventId) {
      throw new Error('event_id is required');
    }
    if (!warehouseCode) {
      throw new Error('warehouse_code is required');
    }
    if (!stockCode) {
      throw new Error('stock_code is required');
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    const isAdmin = profile.role === 'admin';

    if (!isAdmin) {
      const { data: assignment, error: assignmentError } = await supabase
        .from('user_warehouse_assignments')
        .select('warehouse_code')
        .eq('user_id', user.id)
        .eq('warehouse_code', warehouseCode)
        .maybeSingle();

      if (assignmentError || !assignment) {
        throw new Error('You are not assigned to this warehouse');
      }
    }

    const { data: event, error: eventError } = await supabase
      .from('stocktake_events')
      .select('status')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !event) {
      throw new Error('Stocktake event not found');
    }

    if (event.status !== 'open') {
      throw new Error('Event is not open for new counts');
    }

    const caseBarcode = toTrimmedString(payload.case_barcode);
    const unitBarcode = toTrimmedString(payload.unit_barcode);

    const productIdentifier = stockCode ?? caseBarcode ?? unitBarcode;
    if (!productIdentifier) {
      throw new Error('One of stock_code, case_barcode, or unit_barcode is required');
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select(
        'stock_code, description, units_per_case, cases_per_layer, layers_per_pallet',
      )
      .or(
        `stock_code.eq.${productIdentifier},case_barcode.eq.${productIdentifier},unit_barcode.eq.${productIdentifier}`,
      )
      .maybeSingle();

    if (productError || !product) {
      throw new Error(`Product not found for identifier: ${productIdentifier}`);
    }

    const packaging: PackagingSnapshot = {
      unitsPerCase: product.units_per_case ?? 1,
      casesPerLayer: product.cases_per_layer ?? 1,
      layersPerPallet: product.layers_per_pallet ?? 1,
      packSize: product.pack_size ?? '',
      description: product.description ?? product.product_name ?? stockCode,
    };

    const singlesUnits = readNumber(payload, ['singles_units', 'singlesUnits', 'units']);
    const singlesCases = readNumber(payload, ['singles_cases', 'singlesCases']);
    const pickFaceLayers = readNumber(payload, ['pick_face_layers', 'pickFaceLayers']);
    const pickFaceCases = readNumber(payload, ['pick_face_cases', 'pickFaceCases']);
    const bulkPallets = readNumber(payload, ['bulk_pallets', 'bulkPallets']);
    const bulkLayers = readNumber(payload, ['bulk_layers', 'bulkLayers']);
    const bulkCases = readNumber(payload, ['bulk_cases', 'bulkCases']);

    const totalUnits = computeTotalUnits(
      singlesUnits,
      singlesCases,
      pickFaceLayers,
      pickFaceCases,
      bulkPallets,
      bulkLayers,
      bulkCases,
      packaging,
    );

    console.log(`Calculated total units: ${totalUnits}`);

    if (!Number.isFinite(totalUnits) || totalUnits < 0) {
      throw new Error('Calculated total units is invalid');
    }

    let photoPath: string | null = null;
    if (photo) {
      const extension = photo.name.includes('.') ? photo.name.split('.').pop() : 'jpg';
      photoPath = `${eventId}/${warehouseCode}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('count_images')
        .upload(photoPath, photo.data, {
          contentType: photo.contentType,
          cacheControl: '86400',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload photo: ${uploadError.message}`);
      }
    }

    const productDescription = toTrimmedString(payload.product_description) ??
      toTrimmedString(payload.description) ??
      packaging.description;

    const lotNumber = toTrimmedString(payload.lot_number);

    const { data: inserted, error: insertError } = await supabase
      .from('counts')
      .insert({
        event_id: eventId,
        warehouse_code: warehouseCode,
        stock_code: stockCode,
        product_description: productDescription ?? stockCode,
        lot_number: lotNumber,
        counted_by: user.id,
        singles_units: singlesUnits,
        singles_cases: singlesCases,
        pick_face_layers: pickFaceLayers,
        pick_face_cases: pickFaceCases,
        bulk_pallets: bulkPallets,
        bulk_layers: bulkLayers,
        bulk_cases: bulkCases,
        total_units: Math.round(totalUnits),
        units_per_case_snapshot: Math.max(1, packaging.unitsPerCase || 1),
        cases_per_layer_snapshot: Math.max(1, packaging.casesPerLayer || 1),
        layers_per_pallet_snapshot: Math.max(1, packaging.layersPerPallet || 1),
        pack_size_snapshot: packaging.packSize ?? '',
        photo_path: photoPath,
      })
      .select('id, total_units')
      .maybeSingle();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? 'Failed to save count');
    }

    try {
      await supabase.rpc('refresh_counts_totals_mv');
    } catch {
      // Ignore refresh failures to keep submission fast
    }

    console.log(`submit-count function finished successfully for count ${inserted.id}`);

    return new Response(JSON.stringify({ ok: true, id: inserted.id, total_units: inserted.total_units, photo_path: photoPath }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('submit-count function failed:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: message === 'Unauthorized' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
