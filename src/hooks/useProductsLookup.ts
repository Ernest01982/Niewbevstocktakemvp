import { useMemo } from 'react';
import { useQuery } from '../lib/queryClient';
import { supabase, type Product } from '../lib/supabase';

export interface ProductLookupInput {
  stockCode?: string;
  caseBarcode?: string;
  unitBarcode?: string;
}

export function useProductsLookup(input: ProductLookupInput) {
  const normalised = useMemo(() => {
    return {
      stockCode: input.stockCode?.trim() ?? '',
      caseBarcode: input.caseBarcode?.trim() ?? '',
      unitBarcode: input.unitBarcode?.trim() ?? ''
    };
  }, [input.caseBarcode, input.stockCode, input.unitBarcode]);

  return useQuery<Product | null>({
    queryKey: ['product-lookup', normalised.stockCode, normalised.caseBarcode, normalised.unitBarcode],
    enabled: Boolean(normalised.stockCode || normalised.caseBarcode || normalised.unitBarcode),
    queryFn: async () => {
      if (!normalised.stockCode && !normalised.caseBarcode && !normalised.unitBarcode) {
        return null;
      }

      let query = supabase.from('products').select('*').limit(1);
      if (normalised.stockCode) {
        query = query.eq('stock_code', normalised.stockCode);
      } else if (normalised.caseBarcode) {
        query = query.eq('case_barcode', normalised.caseBarcode);
      } else if (normalised.unitBarcode) {
        query = query.eq('unit_barcode', normalised.unitBarcode);
      }

      const { data, error } = await query.maybeSingle<Product>();
      if (error) throw error;
      return data ?? null;
    }
  });
}
