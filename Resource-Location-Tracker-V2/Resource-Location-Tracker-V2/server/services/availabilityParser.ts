import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import type { InsertCrewAvailability, InsertEquipmentAvailability } from '@shared/schema';

export interface FTERow {
  contractor: string;
  category: string;
  avetta: string;
  email: string;
  phone: string;
  birdRep: string;
  location: string;
  fte: string;
  bucket: string;
  digger: string;
  pickup: string;
  bym: string;
  travelTimeDetroit?: string;
  travelTimeColumbus?: string;
  travelTimeCanton?: string;
  travelTimeJackson?: string;
  travelTimeRye?: string;
}

export interface ParsedAvailabilityData {
  crewAvailability: Omit<InsertCrewAvailability, 'contractorId'>;
  equipmentAvailability: Omit<InsertEquipmentAvailability, 'contractorId' | 'crewAvailabilityId'>[];
}

export async function parseFTEFile(filePath: string): Promise<FTERow[]> {
  const extension = filePath.split('.').pop()?.toLowerCase();
  
  if (extension === 'xlsx' || extension === 'xls') {
    return parseExcelFTE(filePath);
  } else if (extension === 'csv') {
    return parseCSVFTE(filePath);
  } else {
    throw new Error('Unsupported file format. Please use CSV or Excel files.');
  }
}

export async function parseExcelFTE(filePath: string): Promise<FTERow[]> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (jsonData.length < 2) {
    throw new Error('File must contain at least a header row and one data row');
  }
  
  const headers = jsonData[0] as string[];
  const rows = jsonData.slice(1) as any[][];
  
  return rows.map((row, index) => {
    const rowObj: any = {};
    headers.forEach((header, headerIndex) => {
      const normalizedHeader = normalizeHeader(header);
      rowObj[normalizedHeader] = row[headerIndex]?.toString().trim() || '';
    });
    
    return mapToFTERow(rowObj, index);
  }).filter(row => row.contractor && row.contractor.trim() !== '');
}

export async function parseCSVFTE(filePath: string): Promise<FTERow[]> {
  const fs = require('fs');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => normalizeHeader(header),
      complete: (results) => {
        try {
          const fteRows = results.data.map((row: any, index: number) => mapToFTERow(row, index))
            .filter((row: FTERow) => row.contractor && row.contractor.trim() !== '');
          resolve(fteRows);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => reject(error)
    });
  });
}

function normalizeHeader(header: string): string {
  const normalized = header.toLowerCase().trim()
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '');
  
  // Map common variations to standard field names
  const headerMappings: { [key: string]: string } = {
    'contractor': 'contractor',
    'company': 'contractor',
    'name': 'contractor',
    'category': 'category',
    'type': 'category',
    'avetta': 'avetta',
    'email': 'email',
    'emailaddress': 'email',
    'phone': 'phone',
    'phonenumber': 'phone',
    'birdrep': 'birdRep',
    'rep': 'birdRep',
    'representative': 'birdRep',
    'location': 'location',
    'city': 'city',
    'state': 'state',
    'address': 'location',
    'fte': 'fte',
    'ftecount': 'fte',
    'headcount': 'fte',
    'crew': 'fte',
    'bucket': 'bucket',
    'buckettrucks': 'bucket',
    'buckets': 'bucket',
    'digger': 'digger',
    'diggers': 'digger',
    'pickup': 'pickup',
    'pickups': 'pickup',
    'trucks': 'pickup',
    'bym': 'bym',
    'byrmilesyard': 'bym',
    'traveltimetodetroitmi': 'travelTimeDetroit',
    'detroittime': 'travelTimeDetroit',
    'traveltimetocolumbusoh': 'travelTimeColumbus',
    'columbustime': 'travelTimeColumbus',
    'traveltimetocantonpa': 'travelTimeCanton',
    'cantontime': 'travelTimeCanton',
    'traveltimetojacksonms': 'travelTimeJackson',
    'jacksontime': 'travelTimeJackson',
    'traveltimetoryeny': 'travelTimeRye',
    'ryetime': 'travelTimeRye'
  };
  
  return headerMappings[normalized] || normalized;
}

function mapToFTERow(rowObj: any, index: number): FTERow {
  // Support both new format (city, state) and legacy format (location)
  let location = '';
  if (rowObj.city && rowObj.state) {
    location = `${rowObj.city}, ${rowObj.state}`;
  } else if (rowObj.location) {
    location = rowObj.location;
  }
  
  return {
    contractor: rowObj.contractor || '',
    category: rowObj.category || '',
    avetta: rowObj.avetta || '',
    email: rowObj.email || '',
    phone: rowObj.phone || '',
    birdRep: rowObj.birdRep || '',
    location,
    fte: rowObj.fte || '0',
    bucket: rowObj.bucket || '0',
    digger: rowObj.digger || '0',
    pickup: rowObj.pickup || '0',
    bym: rowObj.bym || '0',
    travelTimeDetroit: rowObj.travelTimeDetroit || '',
    travelTimeColumbus: rowObj.travelTimeColumbus || '',
    travelTimeCanton: rowObj.travelTimeCanton || '',
    travelTimeJackson: rowObj.travelTimeJackson || '',
    travelTimeRye: rowObj.travelTimeRye || ''
  };
}

export function convertFTEToAvailabilityData(fteRow: FTERow, contractorId: number, availableStartDate: Date, submittedBy: string): ParsedAvailabilityData {
  const fteCount = parseInt(fteRow.fte) || 0;
  
  // Parse location into city and state
  let city = '';
  let state = '';
  if (fteRow.location) {
    const parts = fteRow.location.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      city = parts[0];
      state = parts[1];
    } else if (parts.length === 1) {
      city = parts[0];
    }
  }
  
  // Create crew availability record
  const crewAvailability: Omit<InsertCrewAvailability, 'contractorId'> = {
    submissionDate: new Date(),
    availableStartDate,
    availableEndDate: undefined, // Can be set later
    departureCity: city || undefined,
    departureState: state || undefined,
    departureLocation: fteRow.location || '', // Keep for backward compatibility
    totalFTE: fteCount,
    buckets: parseInt(fteRow.bucket) || 0,
    diggers: parseInt(fteRow.digger) || 0,
    pickups: parseInt(fteRow.pickup) || 0,
    backyardMachines: parseInt(fteRow.bym) || 0,
    // Legacy fields for backward compatibility
    linemenCount: Math.floor(fteCount * 0.6), // Rough estimation
    groundmenCount: Math.floor(fteCount * 0.4),
    operatorsCount: 0,
    foremanCount: fteCount > 5 ? 1 : 0,
    apprenticesCount: 0,
    linemenRate: undefined,
    groundmenRate: undefined,
    operatorsRate: undefined,
    foremanRate: undefined,
    apprenticesRate: undefined,
    status: 'submitted',
    notes: `Imported from FTE file. Location: ${fteRow.location}. Original FTE: ${fteRow.fte}`,
    submittedBy,
    reviewedBy: undefined,
    reviewedAt: undefined
  };
  
  // Create equipment availability records
  const equipmentAvailability: Omit<InsertEquipmentAvailability, 'contractorId' | 'crewAvailabilityId'>[] = [];
  
  const bucketCount = parseInt(fteRow.bucket) || 0;
  if (bucketCount > 0) {
    equipmentAvailability.push({
      equipmentType: 'bucket_truck',
      quantity: bucketCount,
      specifications: 'Standard bucket truck',
      dailyRate: undefined,
      mobilizationCost: undefined,
      availableStartDate,
      availableEndDate: undefined,
      status: 'available',
      notes: 'Imported from FTE file'
    });
  }
  
  const diggerCount = parseInt(fteRow.digger) || 0;
  if (diggerCount > 0) {
    equipmentAvailability.push({
      equipmentType: 'digger',
      quantity: diggerCount,
      specifications: 'Standard digger/excavator',
      dailyRate: undefined,
      mobilizationCost: undefined,
      availableStartDate,
      availableEndDate: undefined,
      status: 'available',
      notes: 'Imported from FTE file'
    });
  }
  
  const pickupCount = parseInt(fteRow.pickup) || 0;
  if (pickupCount > 0) {
    equipmentAvailability.push({
      equipmentType: 'pickup_truck',
      quantity: pickupCount,
      specifications: 'Standard pickup truck',
      dailyRate: undefined,
      mobilizationCost: undefined,
      availableStartDate,
      availableEndDate: undefined,
      status: 'available',
      notes: 'Imported from FTE file'
    });
  }
  
  return {
    crewAvailability,
    equipmentAvailability
  };
}

export function exportAvailabilityToExcel(availabilityData: any[], filename: string): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(availabilityData);
  
  // Auto-width columns
  const columnWidths: any[] = [];
  if (availabilityData.length > 0) {
    const headers = Object.keys(availabilityData[0]);
    headers.forEach((header, index) => {
      let maxWidth = header.length;
      availabilityData.forEach(row => {
        const cellValue = String(row[header] || '');
        maxWidth = Math.max(maxWidth, cellValue.length);
      });
      columnWidths[index] = { wch: Math.min(maxWidth + 2, 50) };
    });
    worksheet['!cols'] = columnWidths;
  }
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Availability');
  
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}