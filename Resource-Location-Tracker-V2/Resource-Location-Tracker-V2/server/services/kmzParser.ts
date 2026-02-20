import { promises as fs } from 'fs';
import * as yauzl from 'yauzl';
import { parseString } from 'xml2js';
import type { InsertResource } from '@shared/schema';

export interface KMLPlacemark {
  name: string;
  description?: string;
  coordinates: [number, number]; // [longitude, latitude]
  properties?: Record<string, any>;
}

export async function parseKMZFile(filePath: string): Promise<KMLPlacemark[]> {
  try {
    // Extract KMZ file (it's a ZIP containing KML)
    const kmlContent = await extractKMLFromKMZ(filePath);
    
    // Parse KML XML
    const placemarks = await parseKML(kmlContent);
    
    return placemarks;
  } catch (error) {
    console.error('Error parsing KMZ file:', error);
    throw new Error('Failed to parse KMZ file');
  }
}

async function extractKMLFromKMZ(kmzPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(kmzPath, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) {
        reject(err);
        return;
      }

      let kmlContent = '';
      
      zipfile.readEntry();
      zipfile.on('entry', (entry: any) => {
        if (entry.fileName.toLowerCase().endsWith('.kml')) {
          zipfile.openReadStream(entry, (err: any, readStream: any) => {
            if (err) {
              reject(err);
              return;
            }

            const chunks: Buffer[] = [];
            readStream.on('data', (chunk: any) => chunks.push(chunk));
            readStream.on('end', () => {
              kmlContent = Buffer.concat(chunks).toString('utf8');
              resolve(kmlContent);
            });
            readStream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        if (!kmlContent) {
          reject(new Error('No KML file found in KMZ archive'));
        }
      });

      zipfile.on('error', reject);
    });
  });
}

async function parseKML(kmlContent: string): Promise<KMLPlacemark[]> {
  return new Promise((resolve, reject) => {
    parseString(kmlContent, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const placemarks: KMLPlacemark[] = [];
        
        // Navigate through KML structure
        const kml = result.kml || result.Document;
        const document = kml.Document?.[0] || kml;
        const folders = document.Folder || [];
        const directPlacemarks = document.Placemark || [];

        // Process direct placemarks
        if (directPlacemarks.length > 0) {
          placemarks.push(...extractPlacemarks(directPlacemarks));
        }

        // Process folders containing placemarks
        folders.forEach((folder: any) => {
          if (folder.Placemark) {
            placemarks.push(...extractPlacemarks(folder.Placemark));
          }
        });

        resolve(placemarks);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function extractPlacemarks(placemarkArray: any[]): KMLPlacemark[] {
  return placemarkArray.map((placemark) => {
    const name = placemark.name?.[0] || 'Unnamed Resource';
    const description = placemark.description?.[0] || '';
    
    // Extract coordinates from Point geometry
    let coordinates: [number, number] = [0, 0];
    
    if (placemark.Point?.[0]?.coordinates?.[0]) {
      const coordString = placemark.Point[0].coordinates[0].trim();
      const [lng, lat] = coordString.split(',').map(parseFloat);
      coordinates = [lng, lat];
    }

    // Extract extended data as properties
    const properties: Record<string, any> = {};
    if (placemark.ExtendedData?.[0]?.Data) {
      placemark.ExtendedData[0].Data.forEach((data: any) => {
        const key = data.$.name;
        const value = data.value?.[0] || '';
        properties[key] = value;
      });
    }

    return {
      name,
      description,
      coordinates,
      properties,
    };
  }).filter(p => p.coordinates[0] !== 0 && p.coordinates[1] !== 0); // Filter out invalid coordinates
}

export function convertToResources(placemarks: KMLPlacemark[]): InsertResource[] {
  return placemarks.map((placemark) => {
    // Try to extract type from various fields
    let type = 'Unknown';
    
    if (placemark.properties) {
      // Common field names for type/category
      type = placemark.properties.type ||
             placemark.properties.category ||
             placemark.properties.Type ||
             placemark.properties.Category ||
             placemark.properties.CLASS ||
             placemark.properties.class ||
             'Unknown';
    }
    
    // If still unknown, try to infer from name or description
    if (type === 'Unknown') {
      const text = `${placemark.name} ${placemark.description || ''}`.toLowerCase();
      
      if (text.includes('union') && !text.includes('non-union')) {
        type = 'Union';
      } else if (text.includes('non-union') || text.includes('nonunion')) {
        type = 'Non-union';
      } else if (text.includes('veg') || text.includes('vegetable')) {
        type = 'Veg';
      } else if (text.includes('hvac') || text.includes('heating') || text.includes('cooling')) {
        type = 'HVAC';
      } else if (text.includes('dat') || text.includes('data')) {
        type = 'DAT';
      } else if (text.includes('consult')) {
        type = 'Consulting';
      } else if (text.includes('logistic') || text.includes('transport') || text.includes('shipping')) {
        type = 'Logistics';
      }
    }

    return {
      name: placemark.name,
      type: type,
      latitude: placemark.coordinates[1],
      longitude: placemark.coordinates[0],
      description: placemark.description,
      properties: placemark.properties,
    };
  });
}
