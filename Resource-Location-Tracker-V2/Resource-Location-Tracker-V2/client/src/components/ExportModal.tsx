import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSessionId } from "@/lib/sessionUtils";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPointId: number | null;
}

export default function ExportModal({ isOpen, onClose, selectedPointId }: ExportModalProps) {
  const [format, setFormat] = useState("excel");
  const [includeDistances, setIncludeDistances] = useState(true);
  const [includeTimes, setIncludeTimes] = useState(true);
  const [includeMap, setIncludeMap] = useState(false);
  const { toast } = useToast();

  const exportMutation = useMutation({
    mutationFn: async (data: any) => {
      const { pointId, format, options } = data;
      
      // Build query parameters
      const params = new URLSearchParams({
        format: format
      });
      
      // Add optional parameters based on options
      if (options.includeDistances === false) {
        params.append('includeDistances', 'false');
      }
      if (options.includeTimes === false) {
        params.append('includeTimes', 'false');
      }
      
      const url = `/api/analysis-points/${pointId}/calculations/export?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Session-ID': getSessionId()
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }
      
      return { response, format };
    },
    onSuccess: async ({ response, format: responseFormat }) => {
      try {
        if (responseFormat === 'csv' || responseFormat === 'excel') {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          // Get filename from Content-Disposition header or use default
          const contentDisposition = response.headers.get('content-disposition');
          let filename = responseFormat === 'excel' ? 'distance-analysis.xlsx' : 'distance-analysis.csv';
          
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '');
            }
          }
          
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          const data = await response.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'distance-analysis.json';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }

        toast({
          title: "Export successful",
          description: "Your analysis has been exported successfully.",
        });
        onClose();
      } catch (downloadError) {
        console.error('Download error:', downloadError);
        toast({
          title: "Download failed",
          description: "Failed to download the exported file.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('Export error:', error);
      toast({
        title: "Export failed",
        description: "Failed to export analysis data.",
        variant: "destructive",
      });
    },
  });

  const handleExport = () => {
    if (!selectedPointId) {
      toast({
        title: "No point selected",
        description: "Please select an analysis point to export.",
        variant: "destructive",
      });
      return;
    }

    console.log('Exporting with options:', {
      format,
      pointId: selectedPointId,
      options: {
        includeDistances,
        includeTimes,
        includeMap,
      },
    });

    exportMutation.mutate({
      format,
      pointId: selectedPointId,
      options: {
        includeDistances,
        includeTimes,
        includeMap,
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" style={{ zIndex: 9999 }}>
        <DialogHeader>
          <DialogTitle>Export Results</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV Spreadsheet</SelectItem>
                <SelectItem value="json">JSON Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Include</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="distances"
                  checked={includeDistances}
                  onCheckedChange={(checked) => setIncludeDistances(checked === true)}
                />
                <label htmlFor="distances" className="text-sm text-gray-700">
                  Distance calculations
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="times"
                  checked={includeTimes}
                  onCheckedChange={(checked) => setIncludeTimes(checked === true)}
                />
                <label htmlFor="times" className="text-sm text-gray-700">
                  Travel time estimates
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="map"
                  checked={includeMap}
                  onCheckedChange={(checked) => setIncludeMap(checked === true)}
                />
                <label htmlFor="map" className="text-sm text-gray-700">
                  Map screenshot (coming soon)
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport}
            disabled={exportMutation.isPending || !selectedPointId}
          >
            <Download className="mr-2" size={16} />
            {exportMutation.isPending ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
