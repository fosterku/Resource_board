import { db } from "./db";
import { crewAvailability } from "../shared/schema";
import { eq, isNotNull, or } from "drizzle-orm";

/**
 * Migration script to split departureLocation into departureCity and departureState
 * This script:
 * 1. Reads all crew_availability records with departureLocation
 * 2. Splits "City, State" format into separate fields
 * 3. Updates the database with new city and state values
 */

async function migrateDepartureLocations() {
  console.log("Starting migration of departure locations...");
  
  try {
    // Get all records that have departureLocation but missing city/state
    const records = await db
      .select()
      .from(crewAvailability)
      .where(
        or(
          isNotNull(crewAvailability.departureLocation)
        )
      );

    console.log(`Found ${records.length} records to process`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of records) {
      try {
        // Skip if already has city and state
        if (record.departureCity && record.departureState) {
          skipped++;
          continue;
        }

        // Skip if no departure location to parse
        if (!record.departureLocation || record.departureLocation.trim() === '') {
          skipped++;
          continue;
        }

        // Parse "City, State" format
        const locationParts = record.departureLocation.split(',').map(part => part.trim());
        
        let city = '';
        let state = '';

        if (locationParts.length >= 2) {
          // Standard "City, State" format
          city = locationParts[0];
          state = locationParts[1];
        } else if (locationParts.length === 1) {
          // Only one part - could be city or state, treat as city
          city = locationParts[0];
        }

        // Update the record
        await db
          .update(crewAvailability)
          .set({
            departureCity: city || null,
            departureState: state || null,
          })
          .where(eq(crewAvailability.id, record.id));

        updated++;
        
        if (updated % 10 === 0) {
          console.log(`Progress: ${updated} records updated...`);
        }
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        errors++;
      }
    }

    console.log("\nMigration complete!");
    console.log(`- Updated: ${updated} records`);
    console.log(`- Skipped: ${skipped} records`);
    console.log(`- Errors: ${errors} records`);

    return { updated, skipped, errors };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

export { migrateDepartureLocations };

// Run migration if executed directly
migrateDepartureLocations()
  .then(() => {
    console.log("Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
