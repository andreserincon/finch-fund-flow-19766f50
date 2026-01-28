import { useQuery } from '@tanstack/react-query';

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
        // Try fetching from Dolar API (official rate)
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        if (response.ok) {
          const data = await response.json();
          return {
            rate: data.venta || 1200, // Use sell rate
            source: 'dolarapi',
            timestamp: new Date().toISOString(),
          };
        }
      } catch (e) {
        console.warn('Failed to fetch exchange rate from dolarapi:', e);
      }

      // Fallback to a default rate if API fails
      return {
        rate: 1200, // Fallback rate
        source: 'fallback',
        timestamp: new Date().toISOString(),
      };
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
    refetchOnWindowFocus: false,
  });

  return {
    exchangeRate: data?.rate ?? 1200,
    source: data?.source ?? 'fallback',
    isLoading,
    error,
  };
}
