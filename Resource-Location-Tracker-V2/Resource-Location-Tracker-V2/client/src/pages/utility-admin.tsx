import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function UtilityAdmin() {
  const [geojsonData, setGeojsonData] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string;
    featureCount?: number;
  } | null>(null);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setGeojsonData(content);
    };
    reader.readAsText(file);
  };

  const validateGeoJSON = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type !== "FeatureCollection") {
        throw new Error("Must be a FeatureCollection");
      }
      if (!Array.isArray(parsed.features)) {
        throw new Error("Must have features array");
      }
      if (parsed.features.length === 0) {
        throw new Error("Must contain at least one feature");
      }
      
      // Check first few features for required properties
      const missingProps = parsed.features.slice(0, 5).filter((feature: any) => {
        return !feature.geometry || !feature.properties || 
               (!feature.properties.NAME && !feature.properties.name && !feature.properties.COMPANY);
      });
      
      if (missingProps.length > 0) {
        throw new Error("Features must have geometry and properties with NAME, name, or COMPANY field");
      }
      
      return { valid: true, featureCount: parsed.features.length };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : "Invalid JSON format" 
      };
    }
  };

  const handleUpload = async () => {
    if (!geojsonData.trim()) {
      toast({
        title: "No data provided",
        description: "Please paste GeoJSON data or upload a file",
        variant: "destructive"
      });
      return;
    }

    const validation = validateGeoJSON(geojsonData);
    if (!validation.valid) {
      toast({
        title: "Invalid GeoJSON",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const response = await fetch("/api/weather/electric-utilities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: geojsonData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      setUploadStatus({
        success: true,
        message: result.message,
        featureCount: result.featureCount
      });

      // Invalidate utilities cache to force refresh
      queryClient.invalidateQueries({ queryKey: ['/api/weather/electric-utilities'] });

      toast({
        title: "Upload successful",
        description: `${result.featureCount} electric utility service areas uploaded. Map will refresh automatically.`,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      setUploadStatus({
        success: false,
        message: errorMessage
      });

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const exampleGeoJSON = `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "NAME": "Florida Power & Light",
        "CUSTOMERS": 5100000,
        "COMPANY": "FPL"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-87.6, 24.5], [-80.0, 24.5], [-80.0, 31.0], [-87.6, 31.0], [-87.6, 24.5]
        ]]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "NAME": "Duke Energy Carolinas",
        "CUSTOMERS": 2800000
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-84.3, 32.0], [-75.4, 32.0], [-75.4, 39.7], [-84.3, 39.7], [-84.3, 32.0]
        ]]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "NAME": "Commonwealth Edison (ComEd)",
        "CUSTOMERS": 4000000
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-88.3, 41.6], [-87.5, 41.6], [-87.5, 42.5], [-88.3, 42.5], [-88.3, 41.6]
        ]]
      }
    }
  ]
}`;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Electric Utility Data Management</h1>
        <p className="text-muted-foreground mt-2">
          Upload custom electric utility service area data in GeoJSON format
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Utility Data
            </CardTitle>
            <CardDescription>
              Provide electric utility service areas as GeoJSON. This will replace the default fallback data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload GeoJSON File
              </label>
              <input
                type="file"
                accept=".json,.geojson"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="text-center text-muted-foreground">or</div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Paste GeoJSON Data
              </label>
              <Textarea
                placeholder="Paste your GeoJSON FeatureCollection here..."
                value={geojsonData}
                onChange={(e) => setGeojsonData(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <Button 
              onClick={handleUpload} 
              disabled={isUploading || !geojsonData.trim()}
              className="w-full"
            >
              {isUploading ? "Uploading..." : "Upload Utility Data"}
            </Button>

            {uploadStatus && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                uploadStatus.success 
                  ? "bg-green-50 text-green-700 border border-green-200" 
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {uploadStatus.success ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <div>
                  <div className="font-medium">
                    {uploadStatus.success ? "Success" : "Error"}
                  </div>
                  <div className="text-sm">
                    {uploadStatus.message}
                    {uploadStatus.featureCount && ` (${uploadStatus.featureCount} utilities)`}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              GeoJSON Format Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-2">
              <p><strong>Required Structure:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Must be a FeatureCollection with features array</li>
                <li>Each feature must have geometry (Polygon/MultiPolygon)</li>
                <li>Each feature must have properties object</li>
                <li>Properties must include one of: NAME, name, or COMPANY</li>
                <li>Optional: CUSTOMERS, Customers, or customers field for customer count</li>
              </ul>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer font-medium">View Example GeoJSON</summary>
              <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-60">
                {exampleGeoJSON}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}