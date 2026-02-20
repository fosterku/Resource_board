import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronUp, ChevronDown } from "lucide-react";
import { getMarkerColor, getResourceColor } from "@/lib/mapUtils";
import WeatherMapLayers from "./WeatherMapLayers";
import { useWeatherData } from "@/hooks/useWeatherData";
import type { Resource, AnalysisPoint, Contractor } from "@shared/schema";

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapContainerProps {
  resources: Resource[];
  analysisPoints: AnalysisPoint[];
  contractors?: Contractor[];
  selectedPointId: number | null;
  onCreatePoint: (point: { label: string; latitude: number; longitude: number }) => void;
  isSelectingPoint?: boolean;
  closestDistance?: number | null;
  maxDistance?: number | null;
  maxHours?: number | null;
  isOutlookLayerVisible?: boolean;
  isUtilitiesLayerVisible?: boolean;
  visibleDays?: { [key: number]: boolean };
}

export default function MapContainer({
  resources,
  analysisPoints,
  contractors = [],
  selectedPointId,
  onCreatePoint,
  isSelectingPoint = false,
  closestDistance = null,
  maxDistance = null,
  maxHours = null,
  isOutlookLayerVisible = false,
  isUtilitiesLayerVisible = false,
  visibleDays = { 1: true, 2: true, 3: true }
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const distanceCircleRef = useRef<any>(null);
  const [mouseCoords, setMouseCoords] = useState({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(6);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  
  // Get weather data for map layers
  const { outlookData, utilitiesData } = useWeatherData();

  // Initialize map (runs only once)
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    console.log('Initializing map...');
    
    const map = L.map(mapRef.current, {
      zoomControl: false // Disable default zoom controls to avoid duplicates
    }).setView([33.7490, -84.3880], 6);
    
    // Add zoom control to top-right position
    L.control.zoom({
      position: 'topright'
    }).addTo(map);
    
    console.log('Map created, adding tile layer...');
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    console.log('Tile layer added');

    // Handle mouse move for coordinates
    map.on('mousemove', (e: any) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Handle zoom changes
    map.on('zoomend', () => {
      setZoom(map.getZoom());
    });

    mapInstanceRef.current = map;

    // Force map to resize after a short delay
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // Empty dependency array - only run once

  // Handle map click for point creation (separate effect)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    const handleMapClick = (e: any) => {
      console.log('Map clicked, isSelectingPoint:', isSelectingPoint);
      if (isSelectingPoint) {
        const pointLabel = `Point ${String.fromCharCode(65 + analysisPoints.length)}`;
        console.log('Creating point:', pointLabel, e.latlng);
        onCreatePoint({
          label: pointLabel,
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
        });
      }
    };
    
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [isSelectingPoint, analysisPoints.length, onCreatePoint]);

  // Update resource markers only when resources actually change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Get current resource IDs on the map
    const currentResourceIds = new Set<number>();
    markersRef.current.forEach((marker, key) => {
      if (key.startsWith('resource-') && !key.includes('label')) {
        const id = parseInt(key.replace('resource-', ''), 10);
        if (!isNaN(id)) {
          currentResourceIds.add(id);
        }
      }
    });

    // Get new resource IDs from props
    const newResourceIds = new Set(resources.map(r => r.id));

    // Remove markers for resources that no longer exist
    currentResourceIds.forEach(id => {
      if (!newResourceIds.has(id)) {
        const markerKey = `resource-${id}`;
        const labelKey = `resource-label-${id}`;
        
        // Clean up all related markers
        [markerKey, labelKey].forEach(key => {
          const marker = markersRef.current.get(key);
          if (marker) {
            try {
              if (map.hasLayer(marker)) {
                map.removeLayer(marker);
              }
            } catch (e) {
              // Marker might already be removed, ignore error
            }
            markersRef.current.delete(key);
          }
        });
      }
    });

    // Add markers for new resources
    resources.forEach((resource) => {
      const markerKey = `resource-${resource.id}`;
      
      // Skip if marker already exists
      if (markersRef.current.has(markerKey)) return;

      const color = getResourceColor(resource.type);
      
      // Create main resource marker - clean consistent style for all markers
      const marker = L.circleMarker([resource.latitude, resource.longitude], {
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
        pane: 'markerPane'
      });

      // Create label with better styling
      const labelHtml = `
        <div style="
          font-size: 10px; 
          color: #1f2937; 
          font-weight: 600; 
          text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;
          white-space: nowrap;
          pointer-events: none;
          background: rgba(255,255,255,0.8);
          padding: 1px 3px;
          border-radius: 3px;
          border: 1px solid rgba(0,0,0,0.1);
        ">${resource.name}</div>
      `;
      
      const labelIcon = L.divIcon({
        className: 'resource-label-custom',
        html: labelHtml,
        iconSize: [0, 0],
        iconAnchor: [0, -12]
      });

      const labelMarker = L.marker([resource.latitude, resource.longitude], { 
        icon: labelIcon,
        interactive: false,
        pane: 'overlayPane'
      });

      // Add popup to main marker
      marker.bindPopup(`
        <div style="padding: 12px; min-width: 200px;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: #1f2937;">${resource.name}</div>
          <div style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">${resource.type}</div>
          <div style="color: #9ca3af; font-size: 12px; margin-bottom: 4px;">
            ${resource.latitude.toFixed(6)}, ${resource.longitude.toFixed(6)}
          </div>
          ${resource.description ? `<div style="color: #4b5563; font-size: 13px; margin-top: 8px; border-top: 1px solid #e5e7eb; padding-top: 8px;">${resource.description}</div>` : ''}
        </div>
      `, {
        maxWidth: 300,
        className: 'custom-popup'
      });

      // Add to map
      marker.addTo(map);
      labelMarker.addTo(map);

      // Store references
      markersRef.current.set(markerKey, marker);
      markersRef.current.set(`resource-label-${resource.id}`, labelMarker);
    });

    console.log(`Updated resource markers: ${resources.length} resources`);
  }, [resources]);

  // Update departure location markers (storage yards) - render as regular resources
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Clear existing departure location markers
    markersRef.current.forEach((marker, key) => {
      if (key.startsWith('departure-')) {
        map.removeLayer(marker);
        markersRef.current.delete(key);
      }
    });

    // Add departure location markers from all contractors as regular resource markers
    let markerCount = 0;
    contractors.forEach((contractor) => {
      if (contractor.departureLocations && Array.isArray(contractor.departureLocations)) {
        contractor.departureLocations.forEach((location: any, idx: number) => {
          if (location.latitude && location.longitude) {
            const markerKey = `departure-${contractor.id}-${idx}`;
            
            // Skip if marker already exists
            if (markersRef.current.has(markerKey)) return;

            // Use the contractor's category color for storage yard markers
            const color = getResourceColor(contractor.category || 'Unknown');
            
            // Create main resource marker (same style as regular resources)
            const marker = L.circleMarker([location.latitude, location.longitude], {
              radius: 8,
              fillColor: color,
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.8,
              pane: 'markerPane'
            });

            // Create label with company name
            const labelHtml = `
              <div style="
                font-size: 10px; 
                color: #1f2937; 
                font-weight: 600; 
                text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;
                white-space: nowrap;
                pointer-events: none;
                background: rgba(255,255,255,0.8);
                padding: 1px 3px;
                border-radius: 3px;
                border: 1px solid rgba(0,0,0,0.1);
              ">${contractor.company}</div>
            `;
            
            const labelIcon = L.divIcon({
              className: 'resource-label-custom',
              html: labelHtml,
              iconSize: [0, 0],
              iconAnchor: [0, -12]
            });

            const labelMarker = L.marker([location.latitude, location.longitude], { 
              icon: labelIcon,
              interactive: false,
              pane: 'overlayPane'
            });

            // Add popup with full contractor and storage yard info
            marker.bindPopup(`
              <div style="padding: 12px; min-width: 200px;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: #1f2937;">${contractor.company}</div>
                <div style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">Storage Yard - ${contractor.category || 'Unknown'}</div>
                <div style="color: #9ca3af; font-size: 12px; margin-bottom: 4px;">
                  ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
                </div>
                <div style="color: #4b5563; font-size: 13px; margin-top: 8px; border-top: 1px solid #e5e7eb; padding-top: 8px;">
                  📍 ${location.location}
                </div>
                ${contractor.name ? `<div style="color: #6b7280; font-size: 12px; margin-top: 4px;">Contact: ${contractor.name}</div>` : ''}
                ${contractor.phone ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">📞 ${contractor.phone}</div>` : ''}
                ${contractor.email ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">✉️ ${contractor.email}</div>` : ''}
                ${contractor.birdRep ? `<div style="color: #6b7280; font-size: 12px; margin-top: 4px;">Bird Rep: ${contractor.birdRep}</div>` : ''}
              </div>
            `, {
              maxWidth: 300,
              className: 'custom-popup'
            });

            // Add to map
            marker.addTo(map);
            labelMarker.addTo(map);

            // Store references
            markersRef.current.set(markerKey, marker);
            markersRef.current.set(`${markerKey}-label`, labelMarker);
            markerCount++;
          }
        });
      }
    });

    console.log(`Updated departure location markers: ${markerCount} locations`);
  }, [contractors]);

  // Update analysis point markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Clear existing point markers
    markersRef.current.forEach((marker, key) => {
      if (key.startsWith('point-')) {
        map.removeLayer(marker);
        markersRef.current.delete(key);
      }
    });

    // Add analysis point markers
    analysisPoints.forEach((point) => {
      const isSelected = point.id === selectedPointId;
      
      // Create a custom hatched pattern icon
      const size = isSelected ? 30 : 24;
      const hatchedIcon = L.divIcon({
        className: 'custom-hatched-marker',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            position: relative;
            border-radius: 50%;
            border: ${isSelected ? '4px' : '3px'} solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            background: conic-gradient(
              from 0deg,
              #DC2626 0deg 45deg,
              #2563EB 45deg 90deg,
              #DC2626 90deg 135deg,
              #2563EB 135deg 180deg,
              #DC2626 180deg 225deg,
              #2563EB 225deg 270deg,
              #DC2626 270deg 315deg,
              #2563EB 315deg 360deg
            );
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: ${size - 8}px;
              height: ${size - 8}px;
              border-radius: 50%;
              background: linear-gradient(
                45deg,
                #DC2626 25%,
                #2563EB 25%,
                #2563EB 50%,
                #DC2626 50%,
                #DC2626 75%,
                #2563EB 75%
              );
              background-size: 8px 8px;
              border: 2px solid #ffffff;
            "></div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const marker = L.marker([point.latitude, point.longitude], {
        icon: hatchedIcon
      }).addTo(map);

      marker.bindPopup(`
        <div class="p-2">
          <div class="font-medium">${point.label}</div>
          <div class="text-sm text-gray-600">Analysis Point</div>
          <div class="text-sm text-gray-500">${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}</div>
        </div>
      `);

      markersRef.current.set(`point-${point.id}`, marker);
    });
  }, [analysisPoints, selectedPointId]);

  // Update isSelectingPoint effect
  useEffect(() => {
    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      
      if (isSelectingPoint) {
        map.getContainer().style.cursor = 'crosshair';
      } else {
        map.getContainer().style.cursor = '';
      }
    }
  }, [isSelectingPoint]);

  // Update distance circle
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    
    // Remove existing circle
    if (distanceCircleRef.current) {
      map.removeLayer(distanceCircleRef.current);
      distanceCircleRef.current = null;
    }

    // Add new circle if we have a selected point and max distance filter
    if (selectedPointId && maxDistance) {
      const selectedPoint = analysisPoints.find(p => p.id === selectedPointId);
      if (selectedPoint) {
        console.log('Creating circle with maxDistance:', maxDistance, 'miles');
        // Convert miles to meters for Leaflet circle
        const radiusInMeters = maxDistance * 1609.34;
        
        distanceCircleRef.current = L.circle([selectedPoint.latitude, selectedPoint.longitude], {
          radius: radiusInMeters,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(map);
      }
    }
  }, [selectedPointId, maxDistance, analysisPoints]);





  const formatCoordinates = (lat: number, lng: number) => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
  };



  return (
    <div className="w-full h-full relative">
      {/* Map Container */}
      <div 
        ref={mapRef} 
        className="w-full h-full" 
        style={{ 
          height: '100%',
          width: '100%'
        }}
      ></div>
      


      {/* Map Status Bar */}
      <Card className="absolute bottom-4 left-4 z-[500] px-3 py-2 bg-white shadow-lg">
        <div className="flex items-center space-x-4 text-xs text-gray-600">
          <span>{formatCoordinates(mouseCoords.lat, mouseCoords.lng)}</span>
          <span className="text-gray-400">|</span>
          <span>Zoom: {zoom}</span>
          <span className="text-gray-400">|</span>
          <span>{resources.length} resources visible</span>
        </div>
      </Card>

      {/* Map Legend */}
      {resources.length > 0 && (
        <Card className="absolute bottom-4 right-4 z-[500] bg-white/95 backdrop-blur-sm shadow-lg border max-w-52">
          <div className="flex items-center justify-between p-3 pb-2">
            <div className="text-sm font-semibold text-gray-900">Map Legend</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              {isLegendCollapsed ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </Button>
          </div>
          
          {!isLegendCollapsed && (
            <div className="px-3 pb-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-700 mb-1">Resource Types</div>
                <div className="grid grid-cols-1 gap-1 text-xs">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Union</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Non-union</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Veg</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-amber-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">HVAC</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-violet-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">DAT</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-pink-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Consulting</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-cyan-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Logistics</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full border border-white shadow-sm"></div>
                    <span className="text-gray-700">Other</span>
                  </div>
                </div>
              </div>
              
              {analysisPoints.length > 0 && (
                <div className="border-t border-gray-200 mt-3 pt-2">
                  <div className="text-xs font-medium text-gray-700 mb-1">Analysis Points</div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm" style={{
                      background: 'conic-gradient(from 0deg, #DC2626 0deg 90deg, #2563EB 90deg 180deg, #DC2626 180deg 270deg, #2563EB 270deg 360deg)'
                    }}></div>
                    <span className="text-gray-700 text-xs">Analysis Point</span>
                  </div>
                </div>
              )}
              
              <div className="border-t border-gray-200 mt-2 pt-2 text-xs text-gray-600">
                {resources.length} resources loaded
              </div>
            </div>
          )}
        </Card>
      )}

      {isSelectingPoint && (
        <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1001] p-3 bg-primary text-primary-foreground">
          <p className="text-sm font-medium">Click on the map to place an analysis point</p>
        </Card>
      )}

      {/* Weather Map Layers */}
      <WeatherMapLayers
        map={mapInstanceRef.current}
        outlookData={outlookData}
        utilitiesData={utilitiesData}
        showOutlookLayer={isOutlookLayerVisible}
        showUtilitiesLayer={isUtilitiesLayerVisible}
        visibleDays={visibleDays}
      />
    </div>
  );
}
