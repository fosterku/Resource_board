import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { CloudUpload, Crosshair, X, FileArchive, MapPin, Search, Filter, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDuration, getMarkerColor } from "@/lib/mapUtils";
import WeatherOverlayPanel from "./WeatherOverlayPanel";
import type { Resource, AnalysisPoint } from "@shared/schema";

interface SidebarProps {
  resources: Resource[];
  analysisPoints: AnalysisPoint[];
  onUploadFile: (file: File) => void;
  onCreatePoint: (point: { label: string; latitude: number; longitude: number }) => void;
  onDeletePoint: (id: number) => void;
  onSelectPoint: (id: number | null) => void;
  selectedPointId: number | null;
  isLoading: boolean;
  isSelectingPoint: boolean;
  onTogglePointSelection: () => void;
  onClosestDistanceChange?: (distance: number | null) => void;
  onMaxDistanceChange?: (distance: number | null) => void;
  onMaxHoursChange?: (hours: number | null) => void;
  onRecalculateDistances?: (pointId: number, maxDistance?: number) => void;
  onToggleOutlookLayer?: (enabled: boolean) => void;
  onToggleUtilitiesLayer?: (enabled: boolean) => void;
  isOutlookLayerVisible?: boolean;
  isUtilitiesLayerVisible?: boolean;
  visibleDays?: { [key: number]: boolean };
  onToggleDay?: (day: number, enabled: boolean) => void;
}

export default function Sidebar({
  resources,
  analysisPoints,
  onUploadFile,
  onCreatePoint,
  onDeletePoint,
  onSelectPoint,
  selectedPointId,
  isLoading,
  isSelectingPoint,
  onTogglePointSelection,
  onClosestDistanceChange,
  onMaxDistanceChange,
  onMaxHoursChange,
  onRecalculateDistances,
  onToggleOutlookLayer = () => {},
  onToggleUtilitiesLayer = () => {},
  isOutlookLayerVisible = false,
  isUtilitiesLayerVisible = false,
  visibleDays = { 1: true, 2: true, 3: true },
  onToggleDay = () => {}
}: SidebarProps) {
  const [sortBy, setSortBy] = useState('distance');
  const [addressInput, setAddressInput] = useState('');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [maxDistance, setMaxDistance] = useState('');
  const [maxHours, setMaxHours] = useState('');
  
  // Conversion factors: assume 55 mph average driving speed
  const convertDistanceToHours = (distance: number): number => {
    return distance / 55; // miles per hour
  };
  
  const convertHoursToDistance = (hours: number): number => {
    return hours * 55; // miles
  };
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: calculations = [], isLoading: isCalculating } = useQuery<any[]>({
    queryKey: [`/api/analysis-points/${selectedPointId}/calculations`],
    enabled: !!selectedPointId,
  });

  // Notify parent when maxDistance changes
  useEffect(() => {
    const distanceValue = maxDistance ? parseFloat(maxDistance) : null;
    onMaxDistanceChange?.(distanceValue);
  }, [maxDistance, onMaxDistanceChange]);

  // Notify parent when maxHours changes
  useEffect(() => {
    const hoursValue = maxHours ? parseFloat(maxHours) : null;
    onMaxHoursChange?.(hoursValue);
  }, [maxHours, onMaxHoursChange]);

  // Filter and sort calculations by distance and hours
  const filteredCalculations = calculations
    .filter((calc: any) => {
      const distanceValue = calc.distance;
      const maxDistanceValue = maxDistance ? parseFloat(maxDistance) : null;
      
      // Filter by distance if specified (show resources WITHIN the distance)
      if (maxDistanceValue && distanceValue > maxDistanceValue) {
        return false;
      }
      
      // Filter by hours if specified (convert miles to hours at 55mph)
      if (maxHours) {
        const hoursToDestination = distanceValue / 55; // 55 mph average speed
        const maxHoursValue = parseFloat(maxHours);
        if (hoursToDestination > maxHoursValue) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a: any, b: any) => {
      // Sort calculations based on sortBy value
      switch (sortBy) {
        case 'time':
        case 'duration':
          return a.duration - b.duration;
        case 'name':
          return a.resource?.name?.localeCompare(b.resource?.name) || 0;
        case 'distance':
        default:
          return a.distance - b.distance;
      }
    });

  // Get the closest distance for circle visualization
  const closestDistance = filteredCalculations.length > 0 
    ? Math.min(...(filteredCalculations as any[]).map((c: any) => c.distance))
    : null;

  // Notify parent of closest distance changes
  useEffect(() => {
    if (onClosestDistanceChange) {
      onClosestDistanceChange(closestDistance);
    }
  }, [closestDistance, onClosestDistanceChange]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
  };

  const handlePointSelection = () => {
    onTogglePointSelection();
  };

  const handleAddressGeocode = async () => {
    if (!addressInput.trim()) return;
    
    setIsGeocodingAddress(true);
    try {
      // Use OpenStreetMap Nominatim for geocoding (free service)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=1&countrycodes=us`
      );
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const results = await response.json();
      
      if (results.length > 0) {
        const result = results[0];
        const pointLabel = `${addressInput} (${String.fromCharCode(65 + analysisPoints.length)})`;
        
        onCreatePoint({
          label: pointLabel,
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
        });
        
        setAddressInput('');
      } else {
        alert('Address not found. Please try a different address or use the map to select a point.');
      }
    } catch (error) {
      alert('Failed to geocode address. Please try again or use the map to select a point.');
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const ext = file.name.toLowerCase();
      if (ext.endsWith('.kmz') || ext.endsWith('.kml') || ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        onUploadFile(file);
      } else {
        alert('Please upload a KMZ, KML, CSV, or Excel file.');
      }
    }
  };

  return (
    <div className="w-80 bg-white shadow-lg border-r border-gray-200 flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-medium text-gray-900 mb-3">Resource Information</h3>
        
        {resources.length > 0 ? (
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileArchive className="text-emerald-600" size={16} />
                  <span className="text-sm font-medium text-emerald-800">Resources loaded</span>
                </div>
                <Badge variant="secondary" className="text-emerald-600 bg-emerald-100">
                  {resources.length} resources
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <div className="text-center">
                <p className="text-sm text-blue-800">Upload contractors from the Contractors page to see resources on the map</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>



      {/* Map Controls */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-medium text-gray-900 mb-3">Analysis Points</h3>
        
        {/* Address Input */}
        <div className="mb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Enter address or zip code..."
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddressGeocode()}
              className="flex-1 min-h-[44px]"
            />
            <Button 
              onClick={handleAddressGeocode}
              disabled={!addressInput.trim() || isGeocodingAddress}
              size="sm"
              className="min-h-[44px] w-full sm:w-auto"
            >
              {isGeocodingAddress ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Search size={16} />
              )}
            </Button>
          </div>
        </div>

        <div className="relative mb-3">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-500">OR</span>
          </div>
        </div>
        
        <Button 
          className="w-full mb-3" 
          onClick={handlePointSelection}
          disabled={isSelectingPoint}
          variant={isSelectingPoint ? "default" : "outline"}
        >
          <MapPin className="mr-2" size={16} />
          {isSelectingPoint ? 'Click on Map to Place Point' : 'Select Point on Map'}
        </Button>
        
        {analysisPoints.map((point) => (
          <Card key={point.id} className={`mb-2 ${selectedPointId === point.id ? 'ring-2 ring-primary' : ''}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="cursor-pointer flex-1" onClick={() => onSelectPoint(point.id)}>
                  <div className="text-sm font-medium text-blue-900">{point.label}</div>
                  <div className="text-xs text-blue-600">
                    {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeletePoint(point.id)}
                  className="text-blue-600 hover:text-blue-800 p-1"
                >
                  <X size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Results Section */}
      <div className="flex-1 p-4">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">Closest Resources</h3>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="distance">Sort by Distance</SelectItem>
                <SelectItem value="time">Sort by Time</SelectItem>
                <SelectItem value="name">Sort by Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Distance Filter */}
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <Input
              placeholder="Max distance (miles)"
              value={maxDistance}
              onChange={(e) => {
                const distance = e.target.value;
                setMaxDistance(distance);
                // Auto-fill hours when distance changes
                if (distance && !isNaN(parseFloat(distance))) {
                  const hours = convertDistanceToHours(parseFloat(distance));
                  setMaxHours(hours.toFixed(1));
                  onMaxDistanceChange?.(parseFloat(distance));
                  onMaxHoursChange?.(hours);
                } else {
                  setMaxHours('');
                  onMaxDistanceChange?.(null);
                  onMaxHoursChange?.(null);
                }
              }}
              type="number"
              min="0"
              step="0.1"
              className="flex-1 min-h-[44px]"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setMaxDistance('');
                setMaxHours('');
                onMaxDistanceChange?.(null);
                onMaxHoursChange?.(null);
              }}
              disabled={!maxDistance && !maxHours}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Hours Filter */}
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <Input
              placeholder="Max hours (driving @ 55mph)"
              value={maxHours}
              onChange={(e) => {
                const hours = e.target.value;
                setMaxHours(hours);
                // Auto-fill distance when hours changes
                if (hours && !isNaN(parseFloat(hours))) {
                  const distance = convertHoursToDistance(parseFloat(hours));
                  setMaxDistance(distance.toFixed(1));
                  onMaxDistanceChange?.(distance);
                  onMaxHoursChange?.(parseFloat(hours));
                } else {
                  setMaxDistance('');
                  onMaxDistanceChange?.(null);
                  onMaxHoursChange?.(null);
                }
              }}
              type="number"
              min="0"
              step="0.1"
              className="flex-1 min-h-[44px]"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setMaxDistance('');
                setMaxHours('');
                onMaxDistanceChange?.(null);
                onMaxHoursChange?.(null);
              }}
              disabled={!maxDistance && !maxHours}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Recalculate Button */}
          {selectedPointId && onRecalculateDistances && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onRecalculateDistances(selectedPointId, maxDistance ? parseFloat(maxDistance) : undefined)}
              className="w-full mb-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recalculate with Distance Filter
            </Button>
          )}
        </div>

        {/* Analysis Summary - individual resources shown in Results tab */}
        {!selectedPointId ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Select an analysis point to see analysis summary
          </p>
        ) : isCalculating ? (
          <Card className="p-3 bg-blue-50 border-blue-200">
            <div className="text-sm font-medium text-blue-900 mb-2">Loading Analysis...</div>
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2 mb-1" />
            <Skeleton className="h-3 w-2/3" />
          </Card>
        ) : filteredCalculations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No calculations available. Make sure resources are loaded.
          </p>
        ) : (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <div className="text-sm font-medium text-blue-900 mb-2">Analysis Summary</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-blue-600">Closest:</span>
                  <span className="font-medium text-blue-900 ml-1">
                    {Math.min(...(filteredCalculations as any[]).map((c: any) => c.distance)).toFixed(1)} mi
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">Avg Distance:</span>
                  <span className="font-medium text-blue-900 ml-1">
                    {((filteredCalculations as any[]).reduce((sum: number, c: any) => sum + c.distance, 0) / (filteredCalculations as any[]).length).toFixed(1)} mi
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">Total Resources:</span>
                  <span className="font-medium text-blue-900 ml-1">{(filteredCalculations as any[]).length}</span>
                </div>
                <div>
                  <span className="text-blue-600">Within 10 mi:</span>
                  <span className="font-medium text-blue-900 ml-1">
                    {(filteredCalculations as any[]).filter((c: any) => c.distance <= 10).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Weather Overlay Panel - Moved to bottom */}
      <div className="p-4 border-t border-gray-200">
        <WeatherOverlayPanel
          onToggleOutlookLayer={onToggleOutlookLayer}
          onToggleUtilitiesLayer={onToggleUtilitiesLayer}
          isOutlookLayerVisible={isOutlookLayerVisible}
          isUtilitiesLayerVisible={isUtilitiesLayerVisible}
          visibleDays={visibleDays}
          onToggleDay={onToggleDay}
        />
      </div>
    </div>
  );
}
