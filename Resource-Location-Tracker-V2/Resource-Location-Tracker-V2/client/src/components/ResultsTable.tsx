import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { useToast } from "@/hooks/use-toast";
import { formatDuration, getMarkerColor, getResourceColor } from "@/lib/mapUtils";
import type { AnalysisPoint } from "@shared/schema";

interface ResultsTableProps {
  analysisPoints: AnalysisPoint[];
  selectedPointId: number | null;
  onSelectPoint: (id: number | null) => void;
  maxDistance?: number | null;
  maxHours?: number | null;
}

export default function ResultsTable({ analysisPoints, selectedPointId, onSelectPoint, maxDistance, maxHours }: ResultsTableProps) {
  const [sortBy, setSortBy] = useState("distance");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [maxDistanceFilter, setMaxDistanceFilter] = useState("");
  const [maxTimeFilter, setMaxTimeFilter] = useState("");
  const { toast } = useToast();

  // Sync local filter with external maxDistance prop
  useEffect(() => {
    if (maxDistance !== null && maxDistance !== undefined) {
      setMaxDistanceFilter(maxDistance.toString());
    }
  }, [maxDistance]);

  // Fetch calculations for selected point
  const { data: calculations = [], isLoading } = useQuery({
    queryKey: [`/api/analysis-points/${selectedPointId}/calculations`],
    enabled: !!selectedPointId,
  });

  // Fetch contractors data
  const { data: contractors = [] } = useQuery({
    queryKey: ["/api/contractors"],
  });

  // Filter and sort calculations with contractor data
  const filteredAndSortedCalculations = useMemo(() => {
    // Join calculations with contractor data
    let filtered = (calculations as any[]).map((calc: any) => {
      const contractorId = calc.resource?.properties?.contractorId;
      const contractor = (contractors as any[]).find((c: any) => c.id === contractorId);
      return {
        ...calc,
        contractor: contractor || {}
      };
    });

    // Apply distance filter (prioritize external maxDistance prop, then local filter)
    const effectiveMaxDistance = maxDistance || (maxDistanceFilter ? parseFloat(maxDistanceFilter) : null);
    if (effectiveMaxDistance) {
      filtered = filtered.filter((calc: any) => calc.distance <= effectiveMaxDistance);
    }

    // Apply hours filter (driving time at 55mph)
    if (maxHours) {
      filtered = filtered.filter((calc: any) => {
        const hoursToDestination = calc.distance / 55; // 55 mph average speed
        return hoursToDestination <= maxHours;
      });
    }

    // Apply time filter (convert minutes to seconds)
    if (maxTimeFilter) {
      const maxTime = parseFloat(maxTimeFilter) * 60;
      filtered = filtered.filter((calc: any) => calc.duration <= maxTime);
    }

    // Sort calculations
    const sorted = [...filtered].sort((a: any, b: any) => {
      let aValue, bValue;

      switch (sortBy) {
        case "name":
          aValue = a.contractor?.name || "";
          bValue = b.contractor?.name || "";
          break;
        case "company":
          aValue = a.contractor?.company || "";
          bValue = b.contractor?.company || "";
          break;
        case "category":
          aValue = a.contractor?.category || "";
          bValue = b.contractor?.category || "";
          break;
        case "pipefile":
          aValue = a.contractor?.pipefile || "";
          bValue = b.contractor?.pipefile || "";
          break;
        case "avetta":
          aValue = a.contractor?.avetta || "";
          bValue = b.contractor?.avetta || "";
          break;
        case "city":
          aValue = a.contractor?.city || "";
          bValue = b.contractor?.city || "";
          break;
        case "state":
          aValue = a.contractor?.state || "";
          bValue = b.contractor?.state || "";
          break;
        case "fullAddress":
          aValue = a.contractor?.fullAddress || "";
          bValue = b.contractor?.fullAddress || "";
          break;
        case "latitude":
          aValue = a.contractor?.latitude || 0;
          bValue = b.contractor?.latitude || 0;
          break;
        case "longitude":
          aValue = a.contractor?.longitude || 0;
          bValue = b.contractor?.longitude || 0;
          break;
        case "phone":
          aValue = a.contractor?.phone || "";
          bValue = b.contractor?.phone || "";
          break;
        case "email":
          aValue = a.contractor?.email || "";
          bValue = b.contractor?.email || "";
          break;
        case "birdRep":
          aValue = a.contractor?.birdRep || "";
          bValue = b.contractor?.birdRep || "";
          break;
        case "subRanking":
          aValue = a.contractor?.subRanking || "";
          bValue = b.contractor?.subRanking || "";
          break;
        case "fteCountsPerLocation":
          aValue = a.contractor?.fteCountsPerLocation || "";
          bValue = b.contractor?.fteCountsPerLocation || "";
          break;
        case "pipefileUpdates":
          aValue = a.contractor?.pipefileUpdates || "";
          bValue = b.contractor?.pipefileUpdates || "";
          break;
        case "notes":
          aValue = a.contractor?.notes || "";
          bValue = b.contractor?.notes || "";
          break;
        case "newMsaComplete":
          aValue = a.contractor?.newMsaComplete || "";
          bValue = b.contractor?.newMsaComplete || "";
          break;
        case "rating":
          aValue = a.contractor?.rating || 0;
          bValue = b.contractor?.rating || 0;
          break;
        case "distance":
          aValue = a.distance || 0;
          bValue = b.distance || 0;
          break;
        case "duration":
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        default:
          aValue = a.distance || 0;
          bValue = b.distance || 0;
      }

      if (typeof aValue === "string") {
        return sortOrder === "asc" 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
      }
    });

    return sorted;
  }, [calculations, maxDistanceFilter, maxTimeFilter, sortBy, sortOrder]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const handleExportExcel = async () => {
    try {
      // Build query parameters for filtering
      const params = new URLSearchParams({ format: 'excel' });
      const effectiveMaxDistance = maxDistance || (maxDistanceFilter ? parseFloat(maxDistanceFilter) : null);
      if (effectiveMaxDistance) {
        params.append('maxDistance', effectiveMaxDistance.toString());
      }
      if (maxTimeFilter) {
        params.append('maxTime', maxTimeFilter);
      }
      
      const response = await fetch(`/api/analysis-points/${selectedPointId}/calculations/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analysis-results-${selectedPointId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "Excel file has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export to Excel. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      // Build query parameters for filtering
      const params = new URLSearchParams({ format: 'csv' });
      const effectiveMaxDistance = maxDistance || (maxDistanceFilter ? parseFloat(maxDistanceFilter) : null);
      if (effectiveMaxDistance) {
        params.append('maxDistance', effectiveMaxDistance.toString());
      }
      if (maxTimeFilter) {
        params.append('maxTime', maxTimeFilter);
      }
      
      const response = await fetch(`/api/analysis-points/${selectedPointId}/calculations/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analysis-results-${selectedPointId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "CSV file has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export to CSV. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportCSVByBirdRep = async () => {
    try {
      // Build query parameters for filtering and Bird Rep grouping
      const params = new URLSearchParams({ format: 'csv', groupByBirdRep: 'true' });
      const effectiveMaxDistance = maxDistance || (maxDistanceFilter ? parseFloat(maxDistanceFilter) : null);
      if (effectiveMaxDistance) {
        params.append('maxDistance', effectiveMaxDistance.toString());
      }
      if (maxTimeFilter) {
        params.append('maxTime', maxTimeFilter);
      }
      
      const response = await fetch(`/api/analysis-points/${selectedPointId}/calculations/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analysis-results-by-bird-rep-${selectedPointId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "ZIP file with separate CSV files for each Bird Rep has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export CSV files by Bird Rep. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportWebEOC = async () => {
    try {
      // Build query parameters for filtering
      const params = new URLSearchParams({ format: 'webeoc' });
      const effectiveMaxDistance = maxDistance || (maxDistanceFilter ? parseFloat(maxDistanceFilter) : null);
      if (effectiveMaxDistance) {
        params.append('maxDistance', effectiveMaxDistance.toString());
      }
      if (maxTimeFilter) {
        params.append('maxTime', maxTimeFilter);
      }
      
      const response = await fetch(`/api/analysis-points/${selectedPointId}/calculations/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `webeoc-contacts-${selectedPointId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "WebEOC Contact CSV file has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export WebEOC contacts. Please try again.",
        variant: "destructive",
      });
    }
  };

  const selectedPoint = analysisPoints.find(p => p.id === selectedPointId);

  if (!selectedPointId) {
    return (
      <Card className="h-full">
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Select an analysis point to view distance calculations.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Loading calculations...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Distance Analysis Results</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {selectedPoint?.label} - {filteredAndSortedCalculations.length} of {(calculations as any[]).length} resources shown
            </p>
          </div>
          
          {/* Analysis Point Selector */}
          <Select value={selectedPointId?.toString() || ""} onValueChange={(value) => onSelectPoint(parseInt(value))}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select analysis point" />
            </SelectTrigger>
            <SelectContent>
              {analysisPoints.map(point => (
                <SelectItem key={point.id} value={point.id.toString()}>
                  {point.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filters and Export */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <div className="flex gap-2 flex-1">
            <div className="flex-1">
              <label className="text-xs text-gray-600 mb-1 block">Max Distance (miles)</label>
              <Input
                type="number"
                placeholder="25"
                value={maxDistanceFilter}
                onChange={(e) => setMaxDistanceFilter(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-600 mb-1 block">Max Drive Time (minutes)</label>
              <Input
                type="number"
                placeholder="30"
                value={maxTimeFilter}
                onChange={(e) => setMaxTimeFilter(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            {/* Excel Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Excel
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (Bird Rep Pages)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* CSV Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <FileText className="h-4 w-4 mr-1" />
                  CSV
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="h-4 w-4 mr-2" />
                  Single CSV File
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCSVByBirdRep}>
                  <Download className="h-4 w-4 mr-2" />
                  ZIP with Bird Rep Files
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportWebEOC} data-testid="export-webeoc">
                  <FileText className="h-4 w-4 mr-2" />
                  WebEOC Contact Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {/* Mobile Card Layout */}
        <div className="block md:hidden overflow-auto h-full max-h-[calc(100vh-300px)] p-4 space-y-3">
          {filteredAndSortedCalculations.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No calculations found</p>
          ) : (
            filteredAndSortedCalculations.map((calc: any) => (
              <Card key={calc.id} className="border-l-4" style={{ borderLeftColor: getResourceColor(calc.contractor?.category || calc.resource.type) }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-sm">{calc.contractor?.name || 'Unknown Contractor'}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {calc.distance?.toFixed(1)} mi
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {formatDuration(calc.duration)}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div><span className="font-medium">MSA Status:</span> {calc.contractor?.newMsaComplete || 'N/A'}</div>
                    <div><span className="font-medium">Company:</span> {calc.contractor?.company || 'N/A'}</div>
                    <div><span className="font-medium">Category:</span> {calc.contractor?.category || 'N/A'}</div>
                    <div><span className="font-medium">SUB Ranking:</span> {calc.contractor?.subRanking || 'N/A'}</div>
                    <div><span className="font-medium">City:</span> {calc.contractor?.city || 'N/A'}</div>
                    <div><span className="font-medium">State:</span> {calc.contractor?.state || 'N/A'}</div>
                    <div><span className="font-medium">Pipefile:</span> {calc.contractor?.pipefile || 'N/A'}</div>
                    <div><span className="font-medium">AVETTA:</span> {calc.contractor?.avetta || 'N/A'}</div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden md:block border rounded-lg overflow-auto h-full max-h-[calc(100vh-300px)]">
          <Table className="relative">
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("name")}
                    className="font-semibold"
                  >
                    Contractor Name {getSortIcon("name")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("newMsaComplete")}
                    className="font-semibold"
                  >
                    MSA Status {getSortIcon("newMsaComplete")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("distance")}
                    className="font-semibold"
                  >
                    Distance (mi) {getSortIcon("distance")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("duration")}
                    className="font-semibold"
                  >
                    Drive Time {getSortIcon("duration")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("company")}
                    className="font-semibold"
                  >
                    Company {getSortIcon("company")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("category")}
                    className="font-semibold"
                  >
                    Category {getSortIcon("category")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("pipefile")}
                    className="font-semibold"
                  >
                    Pipefile {getSortIcon("pipefile")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("avetta")}
                    className="font-semibold"
                  >
                    AVETTA {getSortIcon("avetta")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("city")}
                    className="font-semibold"
                  >
                    City {getSortIcon("city")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("state")}
                    className="font-semibold"
                  >
                    State {getSortIcon("state")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("fullAddress")}
                    className="font-semibold"
                  >
                    Full Address {getSortIcon("fullAddress")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("latitude")}
                    className="font-semibold"
                  >
                    Latitude {getSortIcon("latitude")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("longitude")}
                    className="font-semibold"
                  >
                    Longitude {getSortIcon("longitude")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("phone")}
                    className="font-semibold"
                  >
                    Phone {getSortIcon("phone")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("email")}
                    className="font-semibold"
                  >
                    Email {getSortIcon("email")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("birdRep")}
                    className="font-semibold"
                  >
                    BIRD REP {getSortIcon("birdRep")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("subRanking")}
                    className="font-semibold"
                  >
                    SUB Ranking {getSortIcon("subRanking")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("fteCountsPerLocation")}
                    className="font-semibold"
                  >
                    FTE Counts {getSortIcon("fteCountsPerLocation")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("pipefileUpdates")}
                    className="font-semibold"
                  >
                    Pipefile Updates {getSortIcon("pipefileUpdates")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("notes")}
                    className="font-semibold"
                  >
                    Notes {getSortIcon("notes")}
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCalculations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="text-center py-8 text-gray-500">
                    No resources found within the specified criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCalculations.map((calc: any) => {
                  return (
                    <TableRow key={calc.id} className="hover:bg-gray-50">
                      
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: getResourceColor(calc.contractor?.category || calc.resource.type) }}
                          />
                          {calc.contractor?.name || 'Unknown'}
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-sm">
                        {calc.contractor?.newMsaComplete ? (
                          <Badge variant="default">
                            {calc.contractor.newMsaComplete}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      
                      <TableCell className="font-mono">
                        {calc.distance ? calc.distance.toFixed(1) : '0.0'}
                      </TableCell>
                      
                      <TableCell className="font-mono">
                        {formatDuration(calc.duration || 0)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {calc.contractor?.company || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {calc.contractor?.category || calc.resource?.type || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={calc.contractor?.pipefile === 'Completed' ? 'default' : 'secondary'}>
                          {calc.contractor?.pipefile || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={calc.contractor?.avetta === 'Yes' ? 'default' : 'outline'}>
                          {calc.contractor?.avetta || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {calc.contractor?.city || '-'}
                      </TableCell>
                      <TableCell>
                        {calc.contractor?.state || '-'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={calc.contractor?.fullAddress}>
                        {calc.contractor?.fullAddress || '-'}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {calc.contractor?.latitude ? calc.contractor.latitude.toFixed(6) : '-'}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {calc.contractor?.longitude ? calc.contractor.longitude.toFixed(6) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {calc.contractor?.phone || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {calc.contractor?.email || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {calc.contractor?.birdRep || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {calc.contractor?.subRanking || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {calc.contractor?.fteCountsPerLocation || '-'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={calc.contractor?.pipefileUpdates}>
                        {calc.contractor?.pipefileUpdates || '-'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={calc.contractor?.notes}>
                        {calc.contractor?.notes || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}