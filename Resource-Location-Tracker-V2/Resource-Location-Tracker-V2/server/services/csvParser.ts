import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { InsertResource } from '@shared/schema';

export interface CSVResource {
  name: string;
  type?: string;
  latitude: number;
  longitude: number;
  description?: string;
  address?: string;
  // New contractor fields
  category?: string;
  pipefile?: string;
  avetta?: string;
  company?: string;
  email?: string;
  city?: string;
  state?: string;
  phone?: string;
  birdRep?: string;
  subRanking?: string;
  fteCounts?: string;
  pipefileUpdates?: string;
  newMsaComplete?: string;
  msaStatus?: string;
  rating?: string;
  companyId?: string;
}

export async function parseCSVFile(filePath: string): Promise<CSVResource[]> {
  const fs = await import('fs/promises');
  const csvContent = await fs.readFile(filePath, 'utf-8');
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: false, // Parse without headers first to handle complex structure
      skipEmptyLines: true,
      complete: (results) => {
        try {
          console.log('Raw CSV data sample:', results.data.slice(0, 5));
          
          // Find the actual header row
          let headerRowIndex = -1;
          let headers: string[] = [];
          
          for (let i = 0; i < Math.min(results.data.length, 100); i++) {
            const row = results.data[i] as string[];
            if (row && row.some(cell => cell && cell.toLowerCase().includes('latitude'))) {
              headerRowIndex = i;
              headers = row.map(h => h ? h.toLowerCase().trim() : '');
              break;
            }
          }

          console.log('Found headers at row:', headerRowIndex, headers);

          if (headerRowIndex === -1) {
            // No headers found, try positional parsing for this specific format
            const resources: CSVResource[] = [];
            
            for (let i = 0; i < Math.min(results.data.length, 80); i++) {
              const row = results.data[i] as string[];
              if (!row || row.length < 11) continue;
              
              // Skip if this looks like a header row
              if (row.some(cell => cell && cell.toLowerCase().includes('category'))) continue;
              
              const company = row[4]?.trim();
              const name = row[3]?.trim();
              const resourceName = company || name || 'Unnamed Resource';
              const type = row[0]?.trim() || 'Unknown';
              const latitude = parseFloat(row[9] || '0');
              const longitude = parseFloat(row[10] || '0');
              const address = row[8]?.trim() || '';
              const description = row[15]?.trim() || '';

              if (!isNaN(latitude) && !isNaN(longitude) && latitude !== 0 && longitude !== 0) {
                resources.push({
                  name: resourceName,
                  type,
                  latitude,
                  longitude,
                  description,
                  address
                });
              }
            }
            
            console.log('Parsed resources (positional):', resources.length);
            resolve(resources);
            return;
          }

          // Parse using your specific header structure - support both formats
          const nameIndex = headers.findIndex(h => h.toLowerCase().trim() === 'name');
          const companyIndex = headers.findIndex(h => h.toLowerCase().trim() === 'company');
          const emailIndex = headers.findIndex(h => h.toLowerCase().trim() === 'email');
          const phoneIndex = headers.findIndex(h => h.toLowerCase().trim() === 'phone');
          const categoryIndex = headers.findIndex(h => h.toLowerCase().trim() === 'category');
          const cityIndex = headers.findIndex(h => h.toLowerCase().trim() === 'city');
          const stateIndex = headers.findIndex(h => h.toLowerCase().trim() === 'state');
          const latIndex = headers.findIndex(h => h.toLowerCase().trim() === 'latitude');
          const lngIndex = headers.findIndex(h => h.toLowerCase().trim() === 'longitude');
          const birdRepIndex = headers.findIndex(h => h.toLowerCase().trim() === 'bird rep');
          const pipefileIndex = headers.findIndex(h => h.toLowerCase().trim() === 'pipefile');
          const avettaIndex = headers.findIndex(h => h.toLowerCase().trim() === 'avetta');
          const subRankingIndex = headers.findIndex(h => {
            const normalized = h.toLowerCase().trim().replace(/[-_\s]/g, '');
            return normalized === 'subranking' || normalized === 'sub' || h.toLowerCase().trim() === 'sub ranking' || h.toLowerCase().trim() === 'rating';
          });
          const ratingIndex = headers.findIndex(h => h.toLowerCase().trim() === 'star rating' || h.toLowerCase().trim() === 'overall rating');
          const fteCountsIndex = headers.findIndex(h => h.toLowerCase().trim() === 'fte counts');
          const pipefileUpdatesIndex = headers.findIndex(h => h.toLowerCase().trim() === 'pipefile updates');
          const notesIndex = headers.findIndex(h => h.toLowerCase().trim() === 'notes');
          const newMsaCompleteIndex = headers.findIndex(h => h.toLowerCase().trim() === 'new msa complete');
          const msaStatusIndex = headers.findIndex(h => h.toLowerCase().trim() === 'msa status');
          const companyIdIndex = headers.findIndex(h => h.toLowerCase().trim() === 'company id');
          const addressIndex = headers.findIndex(h => h.toLowerCase().includes('address')); // Keep flexible for address field

          const resources: CSVResource[] = [];
          
          for (let i = headerRowIndex + 1; i < results.data.length; i++) {
            const row = results.data[i] as string[];
            if (!row || row.length <= Math.max(latIndex, lngIndex)) continue;
            
            const category = categoryIndex >= 0 ? row[categoryIndex]?.trim() : 'Unknown';
            const pipefile = pipefileIndex >= 0 ? row[pipefileIndex]?.trim() : '';
            const avetta = avettaIndex >= 0 ? row[avettaIndex]?.trim() : '';
            const name = nameIndex >= 0 ? row[nameIndex]?.trim() : '';
            const company = companyIndex >= 0 ? row[companyIndex]?.trim() : '';
            const email = emailIndex >= 0 ? row[emailIndex]?.trim() : '';
            const city = cityIndex >= 0 ? row[cityIndex]?.trim() : '';
            const state = stateIndex >= 0 ? row[stateIndex]?.trim() : '';
            const fullAddress = addressIndex >= 0 ? row[addressIndex]?.trim() : '';
            const latitude = parseFloat(row[latIndex] || '0');
            const longitude = parseFloat(row[lngIndex] || '0');
            const phone = phoneIndex >= 0 ? row[phoneIndex]?.trim() : '';
            const birdRep = birdRepIndex >= 0 ? row[birdRepIndex]?.trim() : '';
            const subRanking = subRankingIndex >= 0 ? row[subRankingIndex]?.trim() : '';
            const rating = ratingIndex >= 0 ? row[ratingIndex]?.trim() : '';
            const fteCounts = fteCountsIndex >= 0 ? row[fteCountsIndex]?.trim() : '';
            const pipefileUpdates = pipefileUpdatesIndex >= 0 ? row[pipefileUpdatesIndex]?.trim() : '';
            const notes = notesIndex >= 0 ? row[notesIndex]?.trim() : '';
            const newMsaComplete = newMsaCompleteIndex >= 0 ? row[newMsaCompleteIndex]?.trim() : '';
            const msaStatus = msaStatusIndex >= 0 ? row[msaStatusIndex]?.trim() : '';
            const companyId = companyIdIndex >= 0 ? row[companyIdIndex]?.trim() : '';

            const resourceName = name || company || 'Unnamed Resource';

            if (!isNaN(latitude) && !isNaN(longitude) && latitude !== 0 && longitude !== 0) {
              resources.push({
                name: resourceName,
                type: category,
                latitude,
                longitude,
                description: notes,
                address: fullAddress,
                pipefile,
                avetta,
                company,
                email,
                city,
                state,
                phone,
                birdRep,
                subRanking,
                rating,
                fteCounts,
                pipefileUpdates,
                newMsaComplete,
                msaStatus,
                companyId
              });
            }
          }

          console.log('Parsed resources (header-based):', resources.length);
          resolve(resources);
        } catch (error) {
          console.error('CSV parsing error:', error);
          reject(error);
        }
      },
      error: (error: any) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      }
    });
  });
}

export async function parseExcelFile(filePath: string): Promise<CSVResource[]> {
  const fs = await import('fs');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with header normalization
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: ''
  });

  if (jsonData.length < 2) {
    throw new Error('Excel file must have at least a header row and one data row');
  }

  // Get headers and normalize them
  const headers = (jsonData[0] as string[]).map(h => h.toLowerCase().trim());
  const dataRows = jsonData.slice(1) as any[][];

  const resources = dataRows.map((row, index) => {
    const rowObj: any = {};
    headers.forEach((header, i) => {
      rowObj[header] = row[i] || '';
    });

    const name = rowObj.name || rowObj.title || rowObj.resource_name || rowObj.facility_name || `Resource ${index + 1}`;
    const type = rowObj.type || rowObj.category || rowObj.resource_type || 'Unknown';
    const latitude = parseFloat(rowObj.latitude || rowObj.lat || rowObj.y || '0');
    const longitude = parseFloat(rowObj.longitude || rowObj.lng || rowObj.lon || rowObj.x || '0');
    const description = rowObj.description || rowObj.desc || rowObj.notes || '';
    const address = rowObj.address || rowObj.location || '';

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude) || latitude === 0 || longitude === 0) {
      throw new Error(`Invalid coordinates for resource: ${name} at row ${index + 2}`);
    }

    return {
      name,
      type,
      latitude,
      longitude,
      description,
      address
    };
  }).filter(resource => resource.latitude !== 0 && resource.longitude !== 0);

  return resources;
}

export function convertCSVToResources(csvResources: CSVResource[]): InsertResource[] {
  return csvResources.map(csvResource => ({
    name: csvResource.name,
    type: csvResource.type || 'Unknown',
    latitude: csvResource.latitude,
    longitude: csvResource.longitude,
    description: csvResource.description || '',
    properties: csvResource.address ? { address: csvResource.address } : undefined
  }));
}

export function exportToExcel(data: any[], filename: string): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Auto-width columns
  const columnWidths: any[] = [];
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    headers.forEach((header, index) => {
      let maxWidth = header.length;
      data.forEach(row => {
        const cellValue = String(row[header] || '');
        maxWidth = Math.max(maxWidth, cellValue.length);
      });
      columnWidths[index] = { wch: Math.min(maxWidth + 2, 50) }; // Cap at 50 characters
    });
    worksheet['!cols'] = columnWidths;
  }
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function exportToExcelWithBirdRepSheets(data: any[], filename: string): Buffer {
  const workbook = XLSX.utils.book_new();
  
  // Helper function to add auto-width columns to a worksheet
  const addAutoWidthColumns = (worksheet: any, data: any[]) => {
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      const columnWidths: any[] = [];
      headers.forEach((header, index) => {
        let maxWidth = header.length;
        data.forEach(row => {
          const cellValue = String(row[header] || '');
          maxWidth = Math.max(maxWidth, cellValue.length);
        });
        columnWidths[index] = { wch: Math.min(maxWidth + 2, 50) }; // Cap at 50 characters
      });
      worksheet['!cols'] = columnWidths;
    }
  };
  
  // Create master sheet with all data
  const masterWorksheet = XLSX.utils.json_to_sheet(data);
  addAutoWidthColumns(masterWorksheet, data);
  XLSX.utils.book_append_sheet(workbook, masterWorksheet, 'All Results');
  
  // Group data by Bird Rep
  const birdRepGroups = new Map<string, any[]>();
  
  data.forEach(row => {
    const birdRepRaw = row['BIRD REP'] || 'Unassigned';
    // Extract first name if there are multiple names separated by / or &
    const birdRep = birdRepRaw.split(/[\/&]/)[0].trim() || 'Unassigned';
    
    if (!birdRepGroups.has(birdRep)) {
      birdRepGroups.set(birdRep, []);
    }
    birdRepGroups.get(birdRep)!.push(row);
  });
  
  // Sort Bird Reps alphabetically, but put 'Unassigned' last
  const sortedBirdReps = Array.from(birdRepGroups.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
  
  // Create a worksheet for each Bird Rep
  sortedBirdReps.forEach(birdRep => {
    const birdRepData = birdRepGroups.get(birdRep)!;
    
    // Sort the data within each Bird Rep by distance (ascending)
    birdRepData.sort((a, b) => {
      const distanceA = parseFloat(a['Distance (miles)']) || 0;
      const distanceB = parseFloat(b['Distance (miles)']) || 0;
      return distanceA - distanceB;
    });
    
    const worksheet = XLSX.utils.json_to_sheet(birdRepData);
    addAutoWidthColumns(worksheet, birdRepData);
    
    // Clean up sheet name for Excel compatibility
    const cleanSheetName = birdRep
      .replace(/[\\\/\?\*\[\]]/g, '') // Remove invalid characters
      .substring(0, 31); // Excel sheet names max 31 chars
    
    XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName);
  });
  
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
export function exportToCSVWithBirdRepFiles(data: any[], baseFilename: string): { files: Array<{ name: string, content: string }> } {
  const files: Array<{ name: string, content: string }> = [];
  
  // Create master CSV with all data
  const csvHeaders = Object.keys(data[0] || {});
  const masterCsvRows = data.map(row => 
    csvHeaders.map(header => `"${(row as any)[header] || ""}"`).join(",")
  );
  const masterCsv = [csvHeaders.join(","), ...masterCsvRows].join("\n");
  
  files.push({
    name: `${baseFilename}_all_results.csv`,
    content: masterCsv
  });
  
  // Group data by Bird Rep
  const birdRepGroups = new Map<string, any[]>();
  
  data.forEach(row => {
    const birdRepRaw = row["BIRD REP"] || "Unassigned";
    // Extract first name if there are multiple names separated by / or &
    const birdRep = birdRepRaw.split(/[\/&]/)[0].trim() || "Unassigned";
    
    if (!birdRepGroups.has(birdRep)) {
      birdRepGroups.set(birdRep, []);
    }
    birdRepGroups.get(birdRep)!.push(row);
  });
  
  // Sort Bird Reps alphabetically, but put "Unassigned" last
  const sortedBirdReps = Array.from(birdRepGroups.keys()).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });
  
  // Create a CSV file for each Bird Rep
  sortedBirdReps.forEach(birdRep => {
    const birdRepData = birdRepGroups.get(birdRep)!;
    
    // Sort the data within each Bird Rep by distance (ascending)
    birdRepData.sort((a, b) => {
      const distanceA = parseFloat(a["Distance (miles)"]) || 0;
      const distanceB = parseFloat(b["Distance (miles)"]) || 0;
      return distanceA - distanceB;
    });
    
    const birdRepCsvRows = birdRepData.map(row => 
      csvHeaders.map(header => `"${(row as any)[header] || ""}"`).join(",")
    );
    const birdRepCsv = [csvHeaders.join(","), ...birdRepCsvRows].join("\n");
    
    // Clean up filename for filesystem compatibility
    const cleanFilename = birdRep
      .replace(/[\\\/\?\*\[\]<>|:"]/g, "_") // Replace invalid characters
      .replace(/\s+/g, "_"); // Replace spaces with underscores
    
    files.push({
      name: `${baseFilename}_${cleanFilename}.csv`,
      content: birdRepCsv
    });
  });
  
  return { files };
}
