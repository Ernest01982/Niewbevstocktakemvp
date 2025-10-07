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

function parseOcrText(fullText: string): { barcode: string | null; lotNumber: string | null; productName: string | null } {
  if (!fullText) {
    return { barcode: null, lotNumber: null, productName: null };
  }

  const lines = fullText.split('\n').map(line => line.trim());

  // Barcode extraction (ITF-14 or EAN-13)
  const barcodeRegex = /\b(\d{13,14})\b/g;
  let barcode: string | null = null;
  for (const line of lines) {
    const match = barcodeRegex.exec(line);
    if (match) {
      barcode = match[1];
      break;
    }
  }

  // Lot number extraction
  const lotRegex = /(lot|l|batch)\s*:?\s*([a-z0-9\s-]+)/i;
  let lotNumber: string | null = null;
  for (const line of lines) {
    const match = lotRegex.exec(line);
    if (match && match[2]) {
      lotNumber = match[2].trim();
      break;
    }
  }

  // Product name extraction (simple heuristic: assume the longest line is the product name)
  let productName: string | null = null;
  if (lines.length > 0) {
    productName = lines.reduce((a, b) => a.length > b.length ? a : b);
  }


  return { barcode, lotNumber, productName };
}

Deno.serve(async (req: Request) => {
  console.log('process-extractions function started');

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

    console.log(`Found ${pendingCounts?.length ?? 0} pending counts to process.`);

    const processed: string[] = [];
    const updatesFailed: string[] = [];

    for (const row of pendingCounts ?? []) {
      console.log(`Processing count ${row.id}`);
      let extractionLog = [];
      let updatePayload: Record<string, unknown> = {
        status: 'processed',
        extracted_at: nowIso(),
      };

      try {
        if (row.photo_path) {
          console.log(`Downloading photo for count ${row.id}`);
          const { data: photoData, error: downloadError } = await supabase.storage
            .from('count_images')
            .download(row.photo_path);

          if (downloadError) {
            throw new Error(`Failed to download photo: ${downloadError.message}`);
          }

          const imageBytes = new Uint8Array(await photoData.arrayBuffer());
          const imageBase64 = btoa(String.fromCharCode.apply(null, imageBytes));

          console.log(`Calling Vision API for count ${row.id}`);
          const visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${getEnv('VISION_API_KEY')}`;
          const visionApiResponse = await fetch(visionApiUrl, {
            method: 'POST',
            body: JSON.stringify({
              requests: [
                {
                  image: {
                    content: imageBase64,
                  },
                  features: [
                    {
                      type: 'TEXT_DETECTION',
                      maxResults: 1,
                    },
                  ],
                },
              ],
            }),
          });

          if (!visionApiResponse.ok) {
            throw new Error(`Vision API request failed: ${visionApiResponse.statusText}`);
          }

          const visionApiData = await visionApiResponse.json();
          const fullText = visionApiData.responses[0]?.fullTextAnnotation?.text;
          console.log(`OCR outcome for count ${row.id}: ${fullText ? 'Success' : 'Failure'}`);

          const { barcode, lotNumber, productName } = parseOcrText(fullText);

          extractionLog.push({
            processed_at: nowIso(),
            strategy: 'ocr',
            notes: 'Processed with Google Cloud Vision API.',
            fullText: fullText,
            parsed: { barcode, lotNumber, productName },
          });

          updatePayload.extraction_log = extractionLog;
          updatePayload.extracted_barcode = barcode;
          updatePayload.extracted_lot_number = lotNumber;
          updatePayload.extracted_product_name = productName;

        } else {
          console.log(`No photo for count ${row.id}, skipping OCR.`);
          extractionLog.push({
            processed_at: nowIso(),
            strategy: 'no-photo',
            notes: 'No photo provided for this count.',
          });
          updatePayload.extraction_log = extractionLog;
        }

        const { error: updateError } = await supabase
          .from('counts')
          .update(updatePayload)
          .eq('id', row.id);

        if (updateError) {
          throw new Error(`Failed to update count: ${updateError.message}`);
        }

        processed.push(row.id as string);
      } catch (e) {
        updatesFailed.push(row.id as string);
        console.error(`Failed to process count ${row.id}:`, e.message);
        const { error: updateError } = await supabase
          .from('counts')
          .update({
            status: 'failed',
            extraction_log: [
              ...extractionLog,
              {
                processed_at: nowIso(),
                strategy: 'error',
                notes: e.message,
              },
            ],
          })
          .eq('id', row.id);
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
    if (stalePhotos && stalePhotos.length > 0) {
      console.log(`Found ${stalePhotos.length} stale photos to purge.`);
      for (const record of stalePhotos) {
        const path = record.photo_path as string | null;
        if (!path) continue;
        const { error: removeError } = await supabase.storage.from('count_images').remove([path]);
        if (!removeError) {
          await supabase.from('counts').update({ photo_path: null }).eq('id', record.id);
          purged.push(record.id as string);
        }
      }
      console.log(`Purged ${purged.length} photos.`);
    }

    try {
      await supabase.rpc('refresh_counts_totals_mv');
    } catch (_refreshError) {
      // Ignore refresh issues to keep worker resilient
    }

    console.log(`process-extractions function finished successfully. Processed: ${processed.length}, Failed: ${updatesFailed.length}, Purged: ${purged.length}`);

    return new Response(
      JSON.stringify({
        processed: processed.length,
        purged: purged.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('process-extractions function failed:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
