import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { WeatherOutlook } from '@/hooks/useWeatherData';

interface WeatherMapLayersProps {
  map: L.Map | null;
  outlookData: WeatherOutlook | undefined;
  utilitiesData: any;
  showOutlookLayer: boolean;
  showUtilitiesLayer: boolean;
  visibleDays?: { [key: number]: boolean };
}

export default function WeatherMapLayers({
  map,
  outlookData,
  utilitiesData,
  showOutlookLayer,
  showUtilitiesLayer,
  visibleDays = { 1: true, 2: true, 3: true }
}: WeatherMapLayersProps) {
  const outlookLayerRef = useRef<L.LayerGroup | null>(null);
  const utilitiesLayerRef = useRef<L.LayerGroup | null>(null);

  // Helper function to get risk colors
  const getRiskColor = (category: string): string => {
    switch (category.toUpperCase()) {
      case 'HIGH': return '#dc2626'; // red-600
      case 'MDT': return '#f97316';  // orange-500
      case 'ENH': return '#eab308';  // yellow-500
      case 'SLGT': return '#16a34a'; // green-600
      default: return '#6b7280';     // gray-500
    }
  };

  // Helper function to get risk opacity
  const getRiskOpacity = (category: string): number => {
    switch (category.toUpperCase()) {
      case 'HIGH': return 0.7;
      case 'MDT': return 0.6;
      case 'ENH': return 0.5;
      case 'SLGT': return 0.4;
      default: return 0.3;
    }
  };

  // Add SPC Outlook layer
  useEffect(() => {
    if (!map || !outlookData) return;

    // Remove existing layer
    if (outlookLayerRef.current) {
      map.removeLayer(outlookLayerRef.current);
      outlookLayerRef.current = null;
    }

    if (!showOutlookLayer) return;

    // Create new layer group
    const layerGroup = L.layerGroup();

    try {
      outlookData.features.forEach((feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return;

        const category = feature.properties.category || '';
        const day = feature.properties.outlook_day || 1;

        // Skip if this day is not visible
        if (!visibleDays[day]) return;

        // Convert GeoJSON coordinates to Leaflet LatLng format
        const coords = convertGeoJSONToLeaflet(feature.geometry);

        if (coords && coords.length > 0) {
          const polygon = L.polygon(coords, {
            color: getRiskColor(category),
            fillColor: getRiskColor(category),
            fillOpacity: getRiskOpacity(category),
            weight: 2,
            opacity: 0.8
          });

          // Add popup with risk information
          polygon.bindPopup(`
            <div class="text-sm">
              <strong>Day ${day} Outlook</strong><br/>
              Risk Level: <span style="color: ${getRiskColor(category)}; font-weight: bold;">${category}</span><br/>
              <em>SPC Convective Outlook</em>
            </div>
          `);

          layerGroup.addLayer(polygon);
        }
      });

      layerGroup.addTo(map);
      outlookLayerRef.current = layerGroup;

    } catch (error) {
      console.error('Error adding SPC outlook layer:', error);
    }

  }, [map, outlookData, showOutlookLayer, visibleDays]);

  // Add Electric Utilities layer with optimization
  useEffect(() => {
    if (!map || !utilitiesData) return;

    // Remove existing layer
    if (utilitiesLayerRef.current) {
      map.removeLayer(utilitiesLayerRef.current);
      utilitiesLayerRef.current = null;
    }

    if (!showUtilitiesLayer) return;

    // Create new layer group
    const layerGroup = L.layerGroup();

    try {
      if (utilitiesData.features) {
        console.log(`Initializing map...`);
        console.log(`Map created, adding tile layer...`);
        console.log(`Tile layer added`);

        // Get current map zoom for styling
        const currentZoom = map.getZoom();

        // Display all fetched utilities (already sorted by customer count on server)
        const filteredFeatures = utilitiesData.features.filter((feature: any) => {
          return feature.geometry && feature.geometry.coordinates;
        });

        console.log(`Updated resource markers: ${filteredFeatures.length} resources (top utilities by customer count)`);

        // Process filtered features
        filteredFeatures.forEach((feature: any) => {
          // Use authentic field names from the ArcGIS service
          const name = feature.properties.NAME || 'Unknown Utility';
          const customers = feature.properties.CUSTOMERS || 0;
          const state = feature.properties.STATE || '';
          const utilityType = feature.properties.TYPE || '';
          const address = feature.properties.ADDRESS || '';
          const city = feature.properties.CITY || '';

          // Convert GeoJSON coordinates to Leaflet LatLng format
          const coords = convertGeoJSONToLeaflet(feature.geometry);

          if (coords && coords.length > 0) {
            try {
              // Simplified polygon creation - let Leaflet handle the geometry types
              const polygon = L.polygon(coords, {
                color: '#3b82f6', // blue-500
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                weight: 1,
                opacity: 0.6
              });

              // Add popup with authentic utility information
              polygon.bindPopup(`
                <div class="text-sm max-w-64">
                  <strong class="text-base">${name}</strong><br/>
                  ${state ? `<div class="text-gray-600">${city ? city + ', ' : ''}${state}</div>` : ''}
                  <div style="font-weight: bold; color: #2563eb; font-size: 14px; margin: 4px 0;">
                    ${customers > 0 ? customers.toLocaleString() : 'N/A'} Customers
                  </div>
                  ${utilityType && utilityType !== 'NOT AVAILABLE' ? `<div class="text-xs text-gray-500">${utilityType}</div>` : ''}
                  <em class="text-xs">Electric Service Territory</em>
                </div>
              `);

              layerGroup.addLayer(polygon);
              
            } catch (error) {
              console.error(`Error creating polygon for utility ${name}:`, error, feature.geometry.type);
            }
          } else {
            console.warn(`No valid coordinates for utility ${name}`);
          }
        });
      }

      layerGroup.addTo(map);
      utilitiesLayerRef.current = layerGroup;

    } catch (error) {
      console.error('Error adding utilities layer:', error);
    }

  }, [map, utilitiesData, showUtilitiesLayer]);

  // Removed zoom-based optimization - show all utilities >2500 customers at all zoom levels

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map) {
        if (outlookLayerRef.current) {
          map.removeLayer(outlookLayerRef.current);
        }
        if (utilitiesLayerRef.current) {
          map.removeLayer(utilitiesLayerRef.current);
        }
      }
    };
  }, [map]);

  return null; // This component doesn't render anything directly
}

// Helper function to convert GeoJSON coordinates to Leaflet format
function convertGeoJSONToLeaflet(geometry: any): L.LatLngExpression[][] | null {
  try {
    if (!geometry || !geometry.coordinates) {
      return null;
    }

    if (geometry.type === 'Polygon') {
      // Standard polygon: array of rings (first ring is exterior, others are holes)
      return geometry.coordinates.map((ring: number[][]) =>
        ring.map((coord: number[]) => [coord[1], coord[0]] as L.LatLngExpression)
      );
    } else if (geometry.type === 'MultiPolygon') {
      // MultiPolygon: take the first (largest) polygon only to simplify
      if (geometry.coordinates.length > 0) {
        const firstPolygon = geometry.coordinates[0];
        return firstPolygon.map((ring: number[][]) =>
          ring.map((coord: number[]) => [coord[1], coord[0]] as L.LatLngExpression)
        );
      }
    }
    
    console.warn(`Unsupported geometry type: ${geometry.type}`);
    return null;
  } catch (error) {
    console.error('Error converting GeoJSON coordinates:', error, geometry);
    return null;
  }
}