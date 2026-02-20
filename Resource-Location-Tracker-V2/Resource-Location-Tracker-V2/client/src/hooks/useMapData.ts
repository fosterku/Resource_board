import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Resource, AnalysisPoint, InsertAnalysisPoint } from "@shared/schema";

export function useMapData(onPointCreated?: (pointId: number) => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: resources = [], isLoading: resourcesLoading } = useQuery<Resource[]>({
    queryKey: ['/api/resources'],
  });

  const { data: analysisPoints = [], isLoading: pointsLoading } = useQuery<AnalysisPoint[]>({
    queryKey: ['/api/analysis-points'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "File uploaded successfully",
        description: "Processing KMZ file and extracting resources...",
      });

      // Poll for job completion
      const pollJob = () => {
        queryClient.fetchQuery({
          queryKey: [`/api/jobs/${data.jobId}`],
        }).then((job: any) => {
          if (job.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
            toast({
              title: "Resources loaded",
              description: `Successfully loaded ${job.resourceCount} resources from KMZ file.`,
            });
          } else if (job.status === 'failed') {
            toast({
              title: "Processing failed",
              description: job.error || "Failed to process KMZ file.",
              variant: "destructive",
            });
          } else {
            setTimeout(pollJob, 1000);
          }
        });
      };

      setTimeout(pollJob, 1000);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file.",
        variant: "destructive",
      });
    },
  });

  const createPointMutation = useMutation({
    mutationFn: async (point: InsertAnalysisPoint) => {
      const response = await apiRequest('POST', '/api/analysis-points', point);
      return response.json();
    },
    onSuccess: (newPoint) => {
      queryClient.invalidateQueries({ queryKey: ['/api/analysis-points'] });
      
      // Trigger distance calculations
      if (resources.length > 0) {
        calculateDistancesMutation.mutate({ pointId: newPoint.id });
      }

      // Auto-select the newly created point
      if (onPointCreated) {
        onPointCreated(newPoint.id);
      }

      toast({
        title: "Analysis point created",
        description: `Point "${newPoint.label}" has been added to the map.`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to create point",
        description: "Could not create analysis point.",
        variant: "destructive",
      });
    },
  });

  const deletePointMutation = useMutation({
    mutationFn: async (pointId: number) => {
      await apiRequest('DELETE', `/api/analysis-points/${pointId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/analysis-points'] });
      toast({
        title: "Point deleted",
        description: "Analysis point has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete point",
        description: "Could not delete analysis point.",
        variant: "destructive",
      });
    },
  });

  const calculateDistancesMutation = useMutation({
    mutationFn: async ({ pointId, maxDistance }: { pointId: number; maxDistance?: number }) => {
      const response = await apiRequest('POST', `/api/calculate-distances/${pointId}`, { maxDistance });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate all calculation queries for this point
      queryClient.invalidateQueries({ 
        queryKey: [`/api/analysis-points/${variables.pointId}/calculations`],
        exact: false
      });
      toast({
        title: "Distances calculated",
        description: `Calculated distances to ${data.count} resources.`,
      });
    },
    onError: () => {
      toast({
        title: "Calculation failed",
        description: "Could not calculate distances to resources.",
        variant: "destructive",
      });
    },
  });

  return {
    resources,
    analysisPoints,
    isLoading: resourcesLoading || pointsLoading,
    uploadFile: uploadMutation.mutate,
    createAnalysisPoint: createPointMutation.mutate,
    deleteAnalysisPoint: deletePointMutation.mutate,
    calculateDistances: calculateDistancesMutation.mutate,
    isUploading: uploadMutation.isPending,
    isCreatingPoint: createPointMutation.isPending,
  };
}
