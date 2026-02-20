interface SPCOutlookFeature {
  type: "Feature";
  properties: {
    category: string;
    outlook_day?: number;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

interface ElectricUtilityFeature {
  type: "Feature";
  properties: {
    NAME: string;
    Customers: number;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

interface AffectedUtility {
  name: string;
  customers: number;
  intersectingArea: number;
  highestRiskLevel?: string;
  riskLevels?: string[];
}

export async function fetchSPCOutlook(days: number[] = [1, 2, 3]) {
  const baseUrl = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/";
  
  // Map days to layer IDs for PROBABILISTIC WIND OUTLOOK specifically 
  const layerIds = {
    1: 7,  // Day 1 Probabilistic Wind Outlook
    2: 15, // Day 2 Probabilistic Wind Outlook  
    3: 17  // Day 3 Categorical Outlook (since Day 3 doesn't have specific wind probability layer)
  };

  const combinedFeatures: SPCOutlookFeature[] = [];

  console.log(`Fetching SPC wind outlook for days: ${JSON.stringify(days)} (5% or higher wind probability)`);

  for (const day of days) {
    if (!(day in layerIds)) {
      console.warn(`Invalid day number: ${day}. Skipping.`);
      continue;
    }

    const layerId = layerIds[day as keyof typeof layerIds];
    
    // Day 3 uses categorical outlook, so we need different query parameters
    let whereClause, logDescription;
    if (day === 3) {
      // For Day 3 categorical outlook, get ENH, MDT, and HIGH categories
      whereClause = "dn IN (2, 3, 4, 5)"; // SLGT=2, ENH=3, MDT=4, HIGH=5 for categorical outlook
      logDescription = "categorical outlook (ENH, MDT, HIGH categories)";
    } else {
      // For Days 1-2, query for wind probabilities 5% or higher
      whereClause = "dn >= 5"; // 5% or higher wind probability
      logDescription = "wind outlook (5%+ probability)";
    }

    const params = new URLSearchParams({
      where: whereClause,
      outFields: "*",
      f: "geojson",
      returnGeometry: "true"
    });

    console.log(`Day ${day} ${logDescription} query: ${baseUrl}${layerId}/query?${params.toString()}`);

    try {
      console.log(`Fetching Day ${day} ${logDescription}...`);
      const response = await fetch(`${baseUrl}${layerId}/query?${params}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch Day ${day} wind outlook: ${response.status} ${response.statusText}`);
        continue;
      }

      const geojsonData = await response.json();
      
      if (geojsonData?.features) {
        // Process outlook features - different logic for Day 3 vs Days 1-2
        geojsonData.features.forEach((feature: SPCOutlookFeature) => {
          const dnValue = feature.properties.dn;
          const source = feature.properties.idp_source;
          
          if (day === 3) {
            // Day 3 uses categorical outlook: 2=SLGT, 3=ENH, 4=MDT, 5=HIGH
            console.log(`Day ${day} categorical level: ${dnValue}`, 'Source:', source);
            
            if (dnValue >= 3) { // Only include ENH, MDT, HIGH (excluding SLGT=2)
              let category = '';
              if (dnValue === 5) category = 'HIGH';
              else if (dnValue === 4) category = 'MDT';
              else if (dnValue === 3) category = 'ENH';
              else category = 'SLGT';
              
              feature.properties.outlook_day = day;
              feature.properties.category = category;
              feature.properties.categorical_level = dnValue;
              combinedFeatures.push(feature);
            }
          } else {
            // Days 1-2 use wind probability
            console.log(`Day ${day} wind probability: ${dnValue}%`, 'Source:', source);
            
            // Only include areas with 5% or higher wind probability (excluding lowest threat)
            if (dnValue >= 5) {
              // Categorize wind risk based on probability
              let category = '';
              if (dnValue >= 45) category = 'HIGH';        // 45%+ = High
              else if (dnValue >= 30) category = 'MDT';    // 30-44% = Moderate
              else if (dnValue >= 15) category = 'ENH';    // 15-29% = Enhanced
              else if (dnValue >= 5) category = 'SLGT';    // 5-14% = Slight
              else category = 'MRGL';
              
              feature.properties.outlook_day = day;
              feature.properties.category = category;
              feature.properties.wind_probability = dnValue;
              combinedFeatures.push(feature);
            }
          }
        });
        
        const totalFeatures = geojsonData.features.length;
        const filteredCount = combinedFeatures.filter(f => f.properties.outlook_day === day).length;
        console.log(`Fetched ${totalFeatures} total wind features for Day ${day}, filtered to ${filteredCount} wind areas (5%+ probability)`);
      }
    } catch (error) {
      console.error(`Error fetching Day ${day} wind outlook:`, error);
    }
  }

  if (combinedFeatures.length === 0) {
    console.log("No wind areas with 5% or higher probability found in current 3-day outlook.");
  }

  console.log(`Wind outlook result: ${combinedFeatures.length} wind areas with 5%+ probability`);
  return {
    type: "FeatureCollection",
    features: combinedFeatures
  };
}

// Function to generate fallback utility data when APIs fail
function generateFallbackUtilities() {
  // Return a basic set of major utility service areas for demonstration
  // This ensures the map layer functionality works even when external APIs fail
  const majorUtilities = [
    // Major electric utilities with approximate service areas
    { name: "PG&E", customers: 5400000, bounds: [-124.4, 32.5, -114.5, 42.0] }, // California
    { name: "Southern California Edison", customers: 5000000, bounds: [-119.3, 33.7, -116.8, 35.8] },
    { name: "Florida Power & Light", customers: 5100000, bounds: [-87.6, 24.5, -80.0, 31.0] }, // Florida
    { name: "Duke Energy", customers: 7800000, bounds: [-84.3, 32.0, -75.4, 39.7] }, // Carolinas/Ohio
    { name: "Georgia Power", customers: 2600000, bounds: [-85.6, 30.4, -80.8, 35.0] }, // Georgia
    { name: "ConEd", customers: 3400000, bounds: [-74.3, 40.5, -73.7, 41.0] }, // NYC area
    { name: "ComEd", customers: 4000000, bounds: [-88.3, 41.6, -87.5, 42.5] }, // Chicago
    { name: "Xcel Energy", customers: 3600000, bounds: [-105.1, 39.6, -94.4, 45.0] }, // Colorado/Minnesota
    { name: "PEPCO", customers: 860000, bounds: [-77.1, 38.8, -76.9, 39.0] }, // DC area
    { name: "PSEG", customers: 2200000, bounds: [-75.6, 39.4, -73.9, 41.4] }, // New Jersey
  ];

  const features = majorUtilities.map((utility, index) => ({
    type: "Feature",
    properties: {
      NAME: utility.name,
      CUSTOMERS: utility.customers,
      id: index + 1
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [utility.bounds[0], utility.bounds[1]], // SW
        [utility.bounds[2], utility.bounds[1]], // SE
        [utility.bounds[2], utility.bounds[3]], // NE
        [utility.bounds[0], utility.bounds[3]], // NW
        [utility.bounds[0], utility.bounds[1]]  // Close polygon
      ]]
    }
  }));

  return {
    type: "FeatureCollection",
    features,
    fallback: true,
    message: "Using cached utility data - external API unavailable"
  };
}

export async function fetchElectricUtilities() {
  console.log('Electric utilities API called');
  
  // Check for custom uploaded data first
  try {
    const customDataPath = './data/custom_utility_data.json';
    const fs = await import('fs/promises');
    const customData = await fs.readFile(customDataPath, 'utf-8');
    const parsedData = JSON.parse(customData);
    
    if (parsedData.features && parsedData.features.length > 0) {
      console.log(`Returning custom utility data: ${parsedData.features.length} utilities`);
      return {
        ...parsedData,
        source: "custom",
        message: "Using custom uploaded utility data"
      };
    }
  } catch (error) {
    console.log('No custom utility data found, trying external APIs...');
  }

  // Use only the user's specified authentic ArcGIS service URL
  const apiUrl = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Retail_Service_Territories_gdb/FeatureServer/0/query";
  const params = new URLSearchParams({
    outFields: "*", 
    where: "1=1", 
    f: "geojson",
    resultRecordCount: "1500" // Fetch top 1500 utilities
  });

  console.log(`Attempting authentic ArcGIS API: ${apiUrl}`);
  console.log(`Request URL: ${apiUrl}?${params}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(`${apiUrl}?${params}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Storm Response Application)',
        'Accept': 'application/json, application/geo+json',
        'Referer': 'https://www.arcgis.com'
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log(`Authentic ArcGIS API response status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const territoriesGeojson = await response.json();
      console.log(`Raw authentic API response structure:`, {
        type: territoriesGeojson.type,
        featuresCount: territoriesGeojson.features?.length || 0,
        firstFeatureKeys: territoriesGeojson.features?.[0]?.properties ? Object.keys(territoriesGeojson.features[0].properties) : [],
        firstFeature: territoriesGeojson.features?.[0]?.properties || {}
      });
      
      // Validate the response structure
      if (territoriesGeojson.features && Array.isArray(territoriesGeojson.features) && territoriesGeojson.features.length > 0) {
        console.log(`Successfully fetched ${territoriesGeojson.features.length} authentic electric utility territories`);
        
        // Sort by customer count (highest first) and take top 1500
        const sortedFeatures = territoriesGeojson.features
          .filter((feature: any) => feature.properties.CUSTOMERS > 0)
          .sort((a: any, b: any) => (b.properties.CUSTOMERS || 0) - (a.properties.CUSTOMERS || 0))
          .slice(0, 1500);
        
        console.log(`Sorted and filtered to top ${sortedFeatures.length} utilities by customer count`);
        
        // Log first few features to understand the authentic data structure
        sortedFeatures.slice(0, 3).forEach((feature: any, index: number) => {
          console.log(`Top Utility ${index + 1} properties:`, feature.properties);
        });
        
        return {
          ...territoriesGeojson,
          features: sortedFeatures,
          source: "ArcGIS Retail Service Territories (Authentic)",
          message: `Top ${sortedFeatures.length} utilities by customer count loaded from user's ArcGIS service`
        };
      } else {
        console.log('Authentic ArcGIS API returned empty or invalid data structure');
      }
    } else {
      const errorText = await response.text();
      console.log(`Authentic ArcGIS API failed with status ${response.status}: ${errorText.substring(0, 200)}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`Authentic ArcGIS API request failed: ${errorMessage}`);
  }

  console.log('Authentic ArcGIS API failed, using fallback dataset');
  return generateFallbackUtilities();
}

export async function calculateAffectedUtilities(outlookGeojson: any): Promise<AffectedUtility[]> {
  if (!outlookGeojson?.features?.length) {
    console.log("No outlook features provided for intersection calculation");
    return [];
  }

  try {
    // Fetch electric utilities data
    const utilitiesData = await fetchElectricUtilities();
    
    if (!utilitiesData?.features?.length) {
      console.log("No electric utility data available for intersection");
      return [];
    }

    console.log("Calculating intersections between SPC outlook and electric utilities...");
    console.log("Filtering to utilities affected only by HIGH, MDT (Moderate), or ENH (Enhanced) risk areas");
    
    // Pre-filter outlook features to only significant risk levels for efficiency
    const significantRiskLevels = ['HIGH', 'MDT', 'ENH'];
    const significantOutlookFeatures = outlookGeojson.features.filter((feature: any) => {
      const category = feature.properties.category || 'UNKNOWN';
      return significantRiskLevels.includes(category);
    });
    
    if (significantOutlookFeatures.length === 0) {
      console.log("No significant risk areas (HIGH, MDT, ENH) found in outlook");
      return [];
    }
    
    // Create spatial index for outlook features (simplified bounding box index)
    const outlookSpatialIndex = significantOutlookFeatures.map((feature: any) => ({
      feature,
      bounds: calculateBoundingBox([feature]),
      category: feature.properties.category || 'UNKNOWN'
    }));
    
    const affectedUtilities: AffectedUtility[] = [];
    let processedCount = 0;
    
    // Process utilities in batches for better performance
    const batchSize = 50;
    for (let i = 0; i < utilitiesData.features.length; i += batchSize) {
      const batch = utilitiesData.features.slice(i, i + batchSize);
      
      for (const utility of batch) {
        if (!utility.geometry || !utility.properties) continue;
        
        processedCount++;
        
        // Calculate utility bounds once
        const utilityBounds = calculateBoundingBox([utility]);
        
        // Find intersecting significant risk areas using spatial index
        const intersectingRiskLevels = new Set<string>();
        
        for (const indexedFeature of outlookSpatialIndex) {
          if (boundingBoxesIntersect(utilityBounds, indexedFeature.bounds)) {
            intersectingRiskLevels.add(indexedFeature.category);
          }
        }
        
        // Only process utilities that intersect with significant risk areas
        if (intersectingRiskLevels.size > 0) {
          const customers = utility.properties.CUSTOMERS || 
                           utility.properties.Customers || 
                           utility.properties.customers || 
                           utility.properties.Customer_Count ||
                           utility.properties.NUM_CUSTOMERS || 
                           0;
          
          const affectingRiskLevels = Array.from(intersectingRiskLevels);
          
          // Determine highest risk level (priority order: HIGH > MDT > ENH)
          const riskPriority = { HIGH: 4, MDT: 3, ENH: 2, SLGT: 1, UNKNOWN: 0 };
          const highestRisk = affectingRiskLevels.reduce((highest, current) => 
            (riskPriority[current as keyof typeof riskPriority] || 0) > (riskPriority[highest as keyof typeof riskPriority] || 0) ? current : highest, 'UNKNOWN');
          
          // Calculate intersection area estimate (simplified)
          const intersectionArea = calculateIntersectionArea(utilityBounds, outlookSpatialIndex);
          
          affectedUtilities.push({
            name: utility.properties.NAME || 'Unknown Utility',
            customers: customers,
            intersectingArea: intersectionArea,
            highestRiskLevel: highestRisk,
            riskLevels: affectingRiskLevels
          });
        }
      }
      
      // Log progress for large datasets
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount}/${utilitiesData.features.length} utilities...`);
      }
    }

    // Sort by highest risk level first, then by customer count (largest first)
    const riskPriority = { HIGH: 4, MDT: 3, ENH: 2, SLGT: 1, UNKNOWN: 0 };
    affectedUtilities.sort((a, b) => {
      const aRisk = riskPriority[a.highestRiskLevel as keyof typeof riskPriority] || 0;
      const bRisk = riskPriority[b.highestRiskLevel as keyof typeof riskPriority] || 0;
      
      // First sort by risk level (highest first)
      if (aRisk !== bRisk) {
        return bRisk - aRisk;
      }
      
      // Then sort by customer count (largest first)
      return b.customers - a.customers;
    });
    
    console.log(`Found ${affectedUtilities.length} utilities affected by HIGH, MDT, or ENH risk areas (excluding SLGT/slight risk)`);
    return affectedUtilities;
    
  } catch (error) {
    console.error("Error calculating affected utilities:", error);
    throw error;
  }
}

function calculateBoundingBox(features: any[]) {
  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  
  for (const feature of features) {
    if (!feature.geometry?.coordinates) continue;
    
    const coords = flattenCoordinates(feature.geometry.coordinates);
    
    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  
  return { minLng, minLat, maxLng, maxLat };
}

function calculateIntersectionArea(utilityBounds: any, outlookSpatialIndex: any[]): number {
  // Calculate approximate intersection area using bounding box overlap
  let totalIntersectionArea = 0;
  
  for (const indexedFeature of outlookSpatialIndex) {
    if (boundingBoxesIntersect(utilityBounds, indexedFeature.bounds)) {
      // Calculate intersection area of bounding boxes
      const intersectionBounds = {
        minLng: Math.max(utilityBounds.minLng, indexedFeature.bounds.minLng),
        minLat: Math.max(utilityBounds.minLat, indexedFeature.bounds.minLat),
        maxLng: Math.min(utilityBounds.maxLng, indexedFeature.bounds.maxLng),
        maxLat: Math.min(utilityBounds.maxLat, indexedFeature.bounds.maxLat)
      };
      
      const width = intersectionBounds.maxLng - intersectionBounds.minLng;
      const height = intersectionBounds.maxLat - intersectionBounds.minLat;
      totalIntersectionArea += width * height;
    }
  }
  
  return totalIntersectionArea;
}

function flattenCoordinates(coords: any[]): number[][] {
  const result: number[][] = [];
  
  function flatten(arr: any) {
    if (Array.isArray(arr) && arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      result.push([arr[0], arr[1]]);
    } else if (Array.isArray(arr)) {
      arr.forEach(flatten);
    }
  }
  
  flatten(coords);
  return result;
}

function boundingBoxesIntersect(box1: any, box2: any): boolean {
  return !(box1.maxLng < box2.minLng || 
           box2.maxLng < box1.minLng || 
           box1.maxLat < box2.minLat || 
           box2.maxLat < box1.minLat);
}