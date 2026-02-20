# Restore Instructions for Stable Build

## Quick Restore Commands
If new features break the application, use these commands to restore the working state:

```bash
# Restore critical backend files
cp backup/schema.ts.backup shared/schema.ts
cp backup/storage.ts.backup server/storage.ts  
cp backup/routes.ts.backup server/routes.ts

# Restore package dependencies
cp backup/package.json.backup package.json
npm install

# Restart the application
npm run dev
```

## Database State Verification
After restoring, verify these are working:
1. Map loads with 304 resources
2. Analysis points can be created via address input
3. Distance calculations complete successfully
4. Contractors page loads with CRUD operations
5. Export functionality generates files

## Working Test Cases
- Address: "lawrence, ks" → Should create analysis point
- Address: "liberal, KS" → Should create second analysis point
- Export button → Should download Excel file with calculations
- Contractors page → Should show searchable contractor list

## Files NOT Backed Up (Safe to Modify)
- UI components in client/src/components/ui/
- Styling files (CSS, Tailwind config)
- Development configuration files
- Documentation files

## Emergency Rollback
If complete restoration is needed:
1. Check workflow status in Replit
2. Use BUILD_BACKUP.md to verify features
3. Compare current behavior vs. documented working state
4. Restore files as needed using backup files

## Database Reset (If Needed)
```bash
# Only if database corruption occurs
npm run db:push
# Re-upload contractor CSV file to restore data
```

Last Updated: June 27, 2025
Verified Working State: All features functional