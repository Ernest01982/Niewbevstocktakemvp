import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VisionAPIResponse {
  responses: Array<{
    textAnnotations?: Array<{
      description: string;
      locale?: string;
    }>;
    error?: {
      code: number;
      message: string;
    };
  }>;
}

interface ExtractedData {
  product_name: string;
  barcode: string;
  lot_number: string;
  pack_size: string;
  raw_text: string;
}

function extractProductInfo(text: string): ExtractedData {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let productName = '';
  let barcode = '';
  let lotNumber = '';
  let packSize = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase();
    
    if (!barcode) {
      const barcodeMatch = line.match(/\b\d{8,14}\b/);
      if (barcodeMatch) {
        barcode = barcodeMatch[0];
      }
    }
    
    if (!lotNumber) {
      if (upperLine.includes('LOT') || upperLine.includes('BATCH')) {
        const lotMatch = line.match(/(?:LOT|BATCH)[:\s#]*([A-Z0-9-]+)/i);
        if (lotMatch) {
          lotNumber = lotMatch[1];
        } else if (i + 1 < lines.length) {
          lotNumber = lines[i + 1];
        }
      }
    }
    
    if (!packSize) {
      const sizeMatch = line.match(/(\d+\s*(?:kg|g|l|ml|oz|lb|pack|ct|count|pcs|pieces))/i);
      if (sizeMatch) {
        packSize = sizeMatch[1];
      }
    }
    
    if (!productName && i < 3 && line.length > 3 && line.length < 100) {
      if (!line.match(/^\d+$/) && !upperLine.includes('BARCODE') && !upperLine.includes('LOT')) {
        productName = line;
      }
    }
  }
  
  return {
    product_name: productName,
    barcode: barcode,
    lot_number: lotNumber,
    pack_size: packSize,
    raw_text: text
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { image_base64 } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: 'Missing image_base64 parameter' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    
    if (!apiKey) {
      console.error('Google Cloud Vision API key not configured');
      
      const mockText = `Product Name Sample\nBarcode: 1234567890123\nLot: ABC123\n500g Package\nExpiry: 2025-12-31`;
      const extracted = extractProductInfo(mockText);
      
      return new Response(
        JSON.stringify({
          ...extracted,
          mock: true,
          message: 'Using mock data - Configure GOOGLE_CLOUD_VISION_API_KEY for real extraction'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    
    const requestBody = {
      requests: [
        {
          image: {
            content: image_base64.replace(/^data:image\/[a-z]+;base64,/, '')
          },
          features: [
            { type: 'TEXT_DETECTION', maxResults: 1 }
          ]
        }
      ]
    };

    const response = await fetch(visionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status} ${response.statusText}`);
    }

    const visionData: VisionAPIResponse = await response.json();
    
    if (visionData.responses[0]?.error) {
      throw new Error(`Vision API error: ${visionData.responses[0].error.message}`);
    }

    const textAnnotations = visionData.responses[0]?.textAnnotations;
    
    if (!textAnnotations || textAnnotations.length === 0) {
      return new Response(
        JSON.stringify({
          product_name: '',
          barcode: '',
          lot_number: '',
          pack_size: '',
          raw_text: '',
          message: 'No text detected in image'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const fullText = textAnnotations[0].description;
    const extracted = extractProductInfo(fullText);

    return new Response(
      JSON.stringify(extracted),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});