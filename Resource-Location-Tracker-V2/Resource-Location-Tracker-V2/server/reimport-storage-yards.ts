import { parseKMZFile, convertToResources } from './services/kmzParser';
import { db } from './db';
import { resources } from '@shared/schema';
import { eq } from 'drizzle-orm';
import path from 'path';

async function reimportStorageYards() {
  try {
    console.log('Starting storage yard re-import...');
    
    // Parse the KMZ file
    const kmzPath = path.join(process.cwd(), 'attached_assets', 'pipefile 16May2025_1750283456722.kmz');
    console.log(`Parsing KMZ file: ${kmzPath}`);
    
    const placemarks = await parseKMZFile(kmzPath);
    const resourceData = convertToResources(placemarks);
    
    console.log(`Found ${resourceData.length} total items in KMZ file`);
    
    // First, delete only storage yards (not contractors)
    const existingResources = await db.select().from(resources);
    console.log(`Current resources in database: ${existingResources.length}`);
    
    const storageYards = existingResources.filter(r => !r.properties?.contractorId);
    console.log(`Deleting ${storageYards.length} existing storage yards...`);
    
    for (const yard of storageYards) {
      await db.delete(resources).where(eq(resources.id, yard.id));
    }
    
    // Now insert all items from KMZ (they should all be storage yards)
    console.log(`Inserting ${resourceData.length} items from KMZ...`);
    
    let insertedCount = 0;
    for (const data of resourceData) {
      await db.insert(resources).values(data);
      insertedCount++;
    }
    
    console.log(`✓ Successfully inserted ${insertedCount} storage yards`);
    
    // Verify final count
    const finalResources = await db.select().from(resources);
    const finalContractors = finalResources.filter(r => r.properties?.contractorId).length;
    const finalStorageYards = finalResources.filter(r => !r.properties?.contractorId).length;
    
    console.log('\nFinal resource count:');
    console.log(`  - Contractors: ${finalContractors}`);
    console.log(`  - Storage Yards: ${finalStorageYards}`);
    console.log(`  - Total: ${finalResources.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error reimporting storage yards:', error);
    process.exit(1);
  }
}

reimportStorageYards();
