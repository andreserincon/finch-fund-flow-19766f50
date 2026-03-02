/**
 * @file useExchangeRate.ts
 * @description Fetches the current USD → ARS exchange rate from the
 *   dolarapi.com public API (official "venta" rate). Falls back to a
 *   hardcoded rate if the API is unreachable. The value is cached for
 *   30 minutes and does not refetch on window focus.
 */

import { useQuery } from '@tanstack/react-query';

/** API response shape from dolarapi.com */
interface ExchangeRateResponse {
  rate: number;
  source: string;
  timestamp: string;
}

export function useExchangeRate() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['exchange-rate-usd-ars'],
    queryFn: async (): Promise<ExchangeRateResponse> => {
      try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        if (response.ok) {
          const data = await response.json();
          return {
            rate: data.venta || 1200, // Use the sell ("venta") rate
            source: 'dolarapi',
            timestamp: new Date().toISOString(),
          };
        }
      } catch (e) {
        console.warn('Failed to fetch exchange rate from dolarapi:', e);
      }

      // Fallback when the API is unavailable
      return {
        rate: 1200,
        source: 'fallback',
        timestamp: new Date().toISOString(),
      };
    },
    staleTime: 1000 * 60 * 30,     // Cache for 30 minutes
    gcTime: 1000 * 60 * 60,         // Keep in memory for 1 hour
    refetchOnWindowFocus: false,
  });

  return {
    exchangeRate: data?.rate ?? 1200,
    source: data?.source ?? 'fallback',
    isLoading,
    error,
  };
}
