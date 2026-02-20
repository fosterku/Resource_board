# Utility Storm Response Management System

## Overview
This comprehensive storm response management system combines interactive resource mapping with complete contractor management, storm session tracking, roster/crew management, timesheet recording, expense tracking, and automated invoicing. Built with granular role-based access control (RBAC), the system serves multiple user types: administrators managing users, managers orchestrating storm response operations, contractors viewing their own company data, and utility clients with access to specific contractors. The platform integrates PostgreSQL for data persistence, Replit Object Storage for receipts/documents, and complete audit logging for compliance and accountability.

## User Preferences
- Keep implementation simple and streamlined - no fancy stuff, just get it done
- Never use fake or sample data
- Prioritize resource marker visibility during map operations
- Excel export functionality is essential for data analysis
- Clear error handling for file uploads with various formats
- Comprehensive tabular data display with sorting capabilities

## Role-Based Access Control (RBAC)

The system implements a 4-role security model with both backend and frontend enforcement:

### Roles
1. **ADMIN**: User management only
   - Create, edit, delete users
   - Assign roles to users
   - Access: `/users` page only
   
2. **MANAGER**: Full system access
   - All storm response operations (companies, sessions, rosters, timesheets, expenses, invoices)
   - Grant/revoke UTILITY user access to specific companies
   - Access: All pages except `/users`
   
3. **CONTRACTOR**: Own company data only
   - View and edit own company profile
   - View own rosters, timesheets, expenses
   - Access: `/profile` page and own company data
   
4. **UTILITY**: Access to granted companies only
   - View data for companies granted by MANAGER
   - Same features as MANAGER but filtered to accessible companies
   - Access: Storm response pages for granted companies only

### Backend RBAC Implementation
- Helper functions for each entity type: `ensureRosterCompanyAccess`, `ensureTimesheetCompanyAccess`, etc.
- Performance optimization: UTILITY users' accessible companies cached to avoid O(n) queries
- Security: 404-before-403 error handling (fetch entity, check existence, then check access)
- Data integrity: All update operations verify non-null returns before responding

### Frontend RBAC Implementation
- Role guards on all restricted pages (ADMIN, MANAGER, CONTRACTOR checks)
- Navigation dynamically shows/hides links based on user role (desktop + mobile)
- Access management UI for MANAGERs to grant UTILITY access
- User management UI for ADMINs only

## System Architecture
The application is built with a React frontend, utilizing TypeScript and Leaflet with OpenStreetMap tiles for interactive mapping. The backend is an Express.js server handling file uploads and API requests. PostgreSQL with Drizzle ORM ensures persistent data storage. Tailwind CSS and shadcn/ui components are used for the user interface.

### Data Flow & Synchronization
The system maintains seamless data synchronization across three main pages:

1. **Contractor Management Page** → **Map Analysis Page**:
   - Initial contractors imported via CSV/Excel to Contractor Management
   - Contractors with locations are automatically displayed on map
   - Auto-geocoding processes 20 contractors per page load (prioritizes pending review)
   - **Resource Sync**: Resources auto-update when contractors change (company name, category, coordinates, notes, address)
   - Orphaned resources (linked to deleted contractors) are automatically cleaned up
   
2. **Availability Management Page** → **Contractor Management Page** → **Map Analysis Page**:
   - Availability forms sent to contractors (existing + new)
   - Form submissions create new contractors marked as "Pending Review" with departure locations
   - Auto-merge detects duplicates (fuzzy matching on company + name)
   - Manual merge available for handling duplicates
   - When merged, needsReview flag automatically cleared
   
3. **Map Analysis Page** pulls ALL resources:
   - All contractors with valid coordinates (from both sources)
   - All storage yards
   - **Resource Naming**: Map markers display company name (not person name) for clear identification
   - **Visual indicators**: All markers display consistently with white borders (dot color = resource type category)
   - Analysis calculations include ALL resources (contractors + storage yards)
   - Results table separates "Contractor Name" (person) and "Company" (business) columns
   - Results and exports include complete dataset with accurate, up-to-date contractor information

### Key Features

#### Resource Mapping & Analysis
-   **Interactive Map**: Leaflet-based map with marker management and zoom controls. Displays 821+ resources (516 contractors + 305 storage yards).
-   **Contractor Management**: Full CRUD operations for contractors, including a 5-star rating system and file management (upload, download, delete for PDFs, docs, images).
-   **Bulk Import**: Support for CSV, Excel (.xlsx), and KMZ file formats.
-   **Analysis & Export**: User-created analysis points, Mapbox Matrix API calculations for highly cost-effective distance/time (100k free elements/month), and Excel/CSV export of results, including Bird Rep-specific groupings.
-   **GeoJSON API Endpoints**: Live GeoJSON feeds for direct Mapbox integration:
    - `/api/geojson/contractors` - All contractor main and departure locations
    - `/api/geojson/storage-yards` - All storage yard locations
    - `/api/geojson/all` - Combined feed with all locations (contractors + storage yards)
    - Proper GeoJSON FeatureCollection format with [longitude, latitude] coordinates
    - Rich metadata in properties for filtering and display
-   **Weather Overlay**: Integration of NOAA SPC wind outlook (5%+ probability for 3 days) with color-coded risk levels.
-   **Utility Impact Analysis**: Overlay of authentic ArcGIS electric utility service territories, calculation of affected customer counts, and Excel export of impact data.
-   **Contractor Availability System**: Management system with FTE file processing, dual input (self-service portal and manual entry), crew/equipment tracking, and approval workflow.

#### Navigation Architecture
-   **Start Page** (`/`): Unified home page with Resource Analysis Tools (Map, Contractors, Availability), Storm Sessions (active cards + collapsible closed section with create/edit/close/reopen), and Administration links (Companies, Session Admin)
-   **Storm Management Page** (`/storm/:sessionId`): Session-scoped tabbed interface with tabs for Rosters & Crews, Tickets, Timesheets, Expenses, Invoices, Reports. All tabs use the EmbeddedContext to receive the session ID and hide their own headers/session selectors.
-   **EmbeddedContext**: React context (`client/src/context/EmbeddedContext.tsx`) that signals to page components they are embedded within the Storm Management page. When `embedded=true`, pages skip rendering their own header and session selector, using the provided `sessionId` instead.
-   **ActiveSessionContext**: Enhanced with `workingSession` concept - set when user selects a session from Start Page, consumed by all storm pages. Falls back to server-side active session. Cleaned up on navigation away from Storm Management.
-   **Standalone Pages**: All storm pages (rosters, tickets, timesheets, expenses, invoices, reports) still work as standalone pages at their original routes with their own headers and session selectors.

#### Storm Response Management
-   **Company Management**: Integration with existing 309 contractors database
-   **Storm Sessions**: Create and manage storm events with date ranges and descriptions
-   **Roster Management**: Excel import and live editing of crew rosters with personnel and equipment tracking
-   **Timesheet Tracking**: Daily time entry for crews with regular/overtime hours
-   **Expense Management**: Receipt uploads via Object Storage with category tracking
-   **Invoice Generation**: Automated invoice creation from timesheets and expenses
-   **Audit Logging**: Complete audit trail of all changes for compliance
-   **Document Storage**: Replit Object Storage integration for receipts and supporting documents
-   **Role-Based Access**: Granular permissions for ADMIN, MANAGER, CONTRACTOR, and UTILITY roles
-   **User Management**: ADMIN-only interface for user creation and role assignment
-   **Access Management**: MANAGER interface to grant UTILITY users access to specific companies
-   **Contractor Profile**: Self-service profile editing for CONTRACTOR users

#### Ticketing Module
-   **Issue Types**: Configurable issue type catalog (Wire Down, Pole Damage, Transformer, Tree Trimming, Outage, Inspection, Debris) with default priorities
-   **Ticket Lifecycle**: Full status flow CREATED → ASSIGNED → ACCEPTED → ENROUTE → ON_SITE → WORKING → COMPLETED → CLOSED (with BLOCKED/CANCELLED branches)
-   **Server-side Transition Validation**: Only valid status transitions are allowed
-   **Crew Assignment**: Assign tickets to crews from company rosters with accept/reject workflow
-   **Work Segments**: Automatic work segment tracking tied to status changes (open on WORKING/ON_SITE, close on exit states)
-   **Timeline**: Full status event history with timestamps and notes
-   **RBAC**: Ticket creation/assignment restricted to MANAGER/UTILITY; CONTRACTOR sees only company tickets; company access enforced on all endpoints
-   **Tables**: issue_types, tickets, ticket_assignments, ticket_status_events, ticket_work_segments, notifications
-   **Future**: Timesheet auto-generation from ticket work segments

#### Technical Features
-   **Authentication**: Secure user authentication with Replit Auth and role-based routing protection
-   **UI/UX**: Responsive design optimized for mobile and desktop with consistent shadcn/ui components
-   **Performance**: Optimized RBAC queries with caching for UTILITY role filtering

## External Dependencies
-   **Mapping**: OpenStreetMap (via Leaflet)
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Weather Data**: NOAA Storm Prediction Center (SPC) API (for wind outlooks)
-   **Utility Data**: ArcGIS Retail Service Territories database service
-   **Frontend Libraries**: React, TypeScript, Leaflet
-   **Backend Framework**: Express.js
-   **Styling**: Tailwind CSS, shadcn/ui
-   **File Processing**: Libraries for CSV, Excel, and KMZ parsing
-   **Distance Calculations**: Mapbox Matrix API - highly cost-optimized (100k free elements/month, then $2/1k elements)
-   **Geocoding**: Mapbox Geocoding API v6 - cost-effective (100k free requests/month, then $0.75/1k requests)