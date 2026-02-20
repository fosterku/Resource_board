import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface WeatherOutlookFeature {
  type: "Feature";
  properties: {
    category: string;
    outlook_day: number;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface WeatherOutlook {
  type: "FeatureCollection";
  features: WeatherOutlookFeature[];
}

export interface ElectricUtility {
  name: string;
  customers: number;
  intersectingArea: number;
  highestRiskLevel?: string;
  riskLevels?: string[];
}

export function useWeatherData() {
  const queryClient = useQueryClient();

  // Fetch SPC 3-day outlook
  const {
    data: outlookData,
    isLoading: isOutlookLoading,
    error: outlookError,
    refetch: refetchOutlook
  } = useQuery<WeatherOutlook>({
    queryKey: ['/api/weather/spc-outlook'],
    queryFn: async () => {
      const response = await fetch('/api/weather/spc-outlook');
      if (!response.ok) {
        throw new Error(`Failed to fetch SPC outlook: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: false // Don't auto-fetch, only when user requests
  });

  // Fetch electric utilities data
  const {
    data: utilitiesData,
    isLoading: isUtilitiesLoading,
    error: utilitiesError
  } = useQuery({
    queryKey: ['/api/weather/electric-utilities'],
    queryFn: async () => {
      const response = await fetch('/api/weather/electric-utilities');
      if (!response.ok) {
        throw new Error(`Failed to fetch electric utilities: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Check if the response contains an error (in case of API fallback)
      if (data.error) {
        console.warn('Electric utilities API returned error:', data.error);
        // Return the data anyway so the UI can show the error message
        // instead of treating it as a complete failure
      }
      
      return data;
    },
    staleTime: 0, // Always fresh - utility data may have been updated via admin
    enabled: true // Auto-fetch when component mounts
  });

  // Calculate affected utilities
  const calculateAffectedUtilities = useMutation({
    mutationFn: async (outlookGeojson: WeatherOutlook): Promise<ElectricUtility[]> => {
      const response = await fetch('/api/weather/affected-utilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outlookGeojson })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to calculate affected utilities: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries if needed
      queryClient.invalidateQueries({ queryKey: ['/api/weather'] });
    }
  });

  // Load weather data (trigger the queries)
  const loadWeatherData = async () => {
    try {
      await Promise.all([
        refetchOutlook(),
        queryClient.fetchQuery({
          queryKey: ['/api/weather/electric-utilities'],
          queryFn: async () => {
            const response = await fetch('/api/weather/electric-utilities');
            if (!response.ok) {
              throw new Error(`Failed to fetch electric utilities: ${response.statusText}`);
            }
            return response.json();
          }
        })
      ]);
    } catch (error) {
      console.error('Failed to load weather data:', error);
      throw error;
    }
  };

  return {
    // Data
    outlookData,
    utilitiesData,
    
    // Loading states
    isOutlookLoading,
    isUtilitiesLoading,
    isCalculatingAffected: calculateAffectedUtilities.isPending,
    
    // Errors
    outlookError,
    utilitiesError,
    calculationError: calculateAffectedUtilities.error,
    
    // Actions
    loadWeatherData,
    calculateAffectedUtilities: calculateAffectedUtilities.mutateAsync,
    
    // Refetch functions
    refetchOutlook
  };
}