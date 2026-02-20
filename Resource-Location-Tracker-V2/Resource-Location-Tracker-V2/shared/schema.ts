import { pgTable, text, serial, integer, real, timestamp, jsonb, varchar, boolean, bigint, index, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  description: text("description"),
  properties: jsonb("properties"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analysisPoints = pgTable("analysis_points", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  label: text("label").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const distanceCalculations = pgTable("distance_calculations", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  analysisPointId: integer("analysis_point_id").references(() => analysisPoints.id),
  resourceId: integer("resource_id").references(() => resources.id),
  distance: real("distance").notNull(), // in miles
  duration: integer("duration").notNull(), // in seconds
  route: jsonb("route"), // route geometry
  createdAt: timestamp("created_at").defaultNow(),
});

export const contractors = pgTable("contractors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  email: text("email"),
  phone: text("phone"),
  category: text("category").notNull(), // Veg, Union, Non-Union, etc.
  city: text("city"),
  state: text("state"),
  fullAddress: text("full_address"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  departureLocations: jsonb("departure_locations"), // Array of {location: string, latitude: number, longitude: number}
  birdRep: text("bird_rep"),
  pipefile: text("pipefile"), // Pipefile reference
  avetta: text("avetta"), // AVETTA status
  subRanking: text("sub_ranking"),
  fteCountsPerLocation: text("fte_counts_per_location"),
  pipefileUpdates: text("pipefile_updates"),
  notes: text("notes"),
  newMsaComplete: text("new_msa_complete").default(""),
  isnComplete: boolean("isn_complete").default(false),
  rating: real("rating").default(0),
  needsReview: boolean("needs_review").default(false), // Flag for contractors from submissions needing manual review
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contractorFiles = pgTable("contractor_files", {
  id: serial("id").primaryKey(),
  contractorId: integer("contractor_id").notNull().references(() => contractors.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const contractorReviews = pgTable("contractor_reviews", {
  id: serial("id").primaryKey(),
  contractorId: integer("contractor_id").notNull().references(() => contractors.id, { onDelete: "cascade" }),
  submitterName: text("submitter_name").notNull(),
  communicationRating: integer("communication_rating").notNull(), // 1-5 scale
  workQualityRating: integer("work_quality_rating").notNull(), // 1-5 scale
  collaborationRating: integer("collaboration_rating").notNull(), // 1-5 scale
  documentationRating: integer("documentation_rating").notNull(), // 1-5 scale
  hadConflicts: boolean("had_conflicts").notNull(),
  conflictDetails: text("conflict_details"),
  strengths: text("strengths"),
  improvementAreas: text("improvement_areas"),
  metSafetyStandards: boolean("met_safety_standards").notNull(),
  safetyIssues: text("safety_issues"),
  adheredToSchedule: boolean("adhered_to_schedule").notNull(),
  scheduleIssues: text("schedule_issues"),
  wouldRecommend: boolean("would_recommend").notNull(),
  additionalComments: text("additional_comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const analysisJobs = pgTable("analysis_jobs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  status: text("status").notNull(), // 'processing', 'completed', 'failed'
  resourceCount: integer("resource_count"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
});

export const insertContractorSchema = createInsertSchema(contractors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnalysisPointSchema = createInsertSchema(analysisPoints).omit({
  id: true,
  createdAt: true,
});

export const insertDistanceCalculationSchema = createInsertSchema(distanceCalculations).omit({
  id: true,
  createdAt: true,
});

export const insertContractorFileSchema = createInsertSchema(contractorFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertContractorReviewSchema = createInsertSchema(contractorReviews).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisJobSchema = createInsertSchema(analysisJobs).omit({
  id: true,
  createdAt: true,
});

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Contractor = typeof contractors.$inferSelect;
export type InsertContractor = z.infer<typeof insertContractorSchema>;
export type ContractorFile = typeof contractorFiles.$inferSelect;
export type InsertContractorFile = z.infer<typeof insertContractorFileSchema>;
export type ContractorReview = typeof contractorReviews.$inferSelect;
export type InsertContractorReview = z.infer<typeof insertContractorReviewSchema>;
export type AnalysisPoint = typeof analysisPoints.$inferSelect;
export type InsertAnalysisPoint = z.infer<typeof insertAnalysisPointSchema>;
export type DistanceCalculation = typeof distanceCalculations.$inferSelect;
export type InsertDistanceCalculation = z.infer<typeof insertDistanceCalculationSchema>;
export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type InsertAnalysisJob = z.infer<typeof insertAnalysisJobSchema>;

// User authentication table
// Crew availability tracking
export const crewAvailability = pgTable("crew_availability", {
  id: serial("id").primaryKey(),
  contractorId: integer("contractor_id").notNull().references(() => contractors.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => availabilitySessions.id),
  submissionDate: timestamp("submission_date").defaultNow().notNull(),
  availableStartDate: timestamp("available_start_date").notNull(),
  availableEndDate: timestamp("available_end_date"),
  departureCity: text("departure_city"),
  departureState: text("departure_state"),
  departureLocation: text("departure_location"), // Legacy field for backward compatibility
  departureLatitude: real("departure_latitude"),
  departureLongitude: real("departure_longitude"),
  
  // Crew and equipment counts
  totalFTE: integer("total_fte").default(0),
  buckets: integer("buckets").default(0),
  diggers: integer("diggers").default(0),
  pickups: integer("pickups").default(0),
  backyardMachines: integer("backyard_machines").default(0),
  
  // Legacy fields (keeping for backward compatibility)
  linemenCount: integer("linemen_count").default(0),
  groundmenCount: integer("groundmen_count").default(0),
  operatorsCount: integer("operators_count").default(0),
  foremanCount: integer("foreman_count").default(0),
  apprenticesCount: integer("apprentices_count").default(0),
  
  // Rates and costs
  linemenRate: real("linemen_rate"),
  groundmenRate: real("groundmen_rate"),
  operatorsRate: real("operators_rate"),
  foremanRate: real("foreman_rate"),
  apprenticesRate: real("apprentices_rate"),
  
  // Status and metadata
  status: text("status").notNull().default("submitted"), // submitted, approved, deployed, expired
  notes: text("notes"),
  submittedBy: text("submitted_by"), // contractor or staff username
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Equipment availability tracking
export const equipmentAvailability = pgTable("equipment_availability", {
  id: serial("id").primaryKey(),
  contractorId: integer("contractor_id").notNull().references(() => contractors.id, { onDelete: "cascade" }),
  crewAvailabilityId: integer("crew_availability_id").references(() => crewAvailability.id, { onDelete: "cascade" }),
  
  equipmentType: text("equipment_type").notNull(), // bucket_truck, digger, crane, etc.
  quantity: integer("quantity").notNull().default(1),
  specifications: text("specifications"), // height, capacity, special features
  dailyRate: real("daily_rate"),
  mobilizationCost: real("mobilization_cost"),
  
  availableStartDate: timestamp("available_start_date").notNull(),
  availableEndDate: timestamp("available_end_date"),
  
  status: text("status").notNull().default("available"), // available, deployed, maintenance
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Availability submissions for tracking bulk uploads
export const availabilitySubmissions = pgTable("availability_submissions", {
  id: serial("id").primaryKey(),
  contractorId: integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }),
  filename: text("filename"),
  originalName: text("original_name"),
  filePath: text("file_path"),
  submissionType: text("submission_type").notNull(), // file_upload, manual_entry, contractor_portal
  status: text("status").notNull().default("pending"), // pending, processed, failed
  recordsCreated: integer("records_created").default(0),
  errors: text("errors"), // JSON array of any processing errors
  submittedBy: text("submitted_by").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Weekly availability sessions for organizing submissions
export const availabilitySessions = pgTable("availability_sessions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(), // e.g., "Week of Jan 15, 2025"
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").default(true).notNull(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Replit Auth session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Updated users table for Replit Auth + RBAC
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("CONTRACTOR"), // ADMIN, CONTRACTOR, MANAGER, UTILITY
  companyId: varchar("company_id"), // Links to companies.id (UUID)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertCrewAvailabilitySchema = createInsertSchema(crewAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEquipmentAvailabilitySchema = createInsertSchema(equipmentAvailability).omit({
  id: true,
  createdAt: true,
});

export const insertAvailabilitySubmissionSchema = createInsertSchema(availabilitySubmissions).omit({
  id: true,
  createdAt: true,
});

export const insertAvailabilitySessionSchema = createInsertSchema(availabilitySessions).omit({
  id: true,
  createdAt: true,
});

export type CrewAvailability = typeof crewAvailability.$inferSelect;
export type InsertCrewAvailability = z.infer<typeof insertCrewAvailabilitySchema>;
export type EquipmentAvailability = typeof equipmentAvailability.$inferSelect;
export type InsertEquipmentAvailability = z.infer<typeof insertEquipmentAvailabilitySchema>;
export type AvailabilitySubmission = typeof availabilitySubmissions.$inferSelect;
export type InsertAvailabilitySubmission = z.infer<typeof insertAvailabilitySubmissionSchema>;
export type AvailabilitySession = typeof availabilitySessions.$inferSelect;
export type InsertAvailabilitySession = z.infer<typeof insertAvailabilitySessionSchema>;

// Incidents/Storms table
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default('active'), // active, completed, archived
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  priority: varchar("priority", { length: 10 }).default('medium'), // low, medium, high, critical
  location: varchar("location", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by", { length: 50 }).default('admin'),
});

// Incident assignments - linking crews to incidents
export const incidentAssignments = pgTable("incident_assignments", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id),
  crewAvailabilityId: integer("crew_availability_id").references(() => crewAvailability.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by", { length: 50 }).default('admin'),
  status: varchar("status", { length: 20 }).default('assigned'), // assigned, deployed, completed
  notes: text("notes"),
});

// Crew rosters - detailed crew information for deployed teams
export const crewRosters = pgTable("crew_rosters", {
  id: serial("id").primaryKey(),
  incidentAssignmentId: integer("incident_assignment_id").references(() => incidentAssignments.id),
  subcontractor: varchar("subcontractor", { length: 100 }),
  employeeName: varchar("employee_name", { length: 100 }).notNull(),
  allPersonnel: varchar("all_personnel", { length: 50 }), // crew size reference
  gender: varchar("gender", { length: 10 }),
  employeeId: varchar("employee_id", { length: 50 }),
  classification: varchar("classification", { length: 50 }), // General Foreman, Lineman, etc.
  crewId: varchar("crew_id", { length: 20 }),
  location: varchar("location", { length: 100 }), // city, state
  timeIn: varchar("time_in", { length: 20 }), // time and date
  equipmentType: varchar("equipment_type", { length: 50 }), // Pickup, Bucket Truck, etc.
  equipmentId: varchar("equipment_id", { length: 20 }),
  equipmentUnitNumber: varchar("equipment_unit_number", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  createdAt: true,
});

export const insertIncidentAssignmentSchema = createInsertSchema(incidentAssignments).omit({
  id: true,
  assignedAt: true,
});

export const insertCrewRosterSchema = createInsertSchema(crewRosters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type IncidentAssignment = typeof incidentAssignments.$inferSelect;
export type InsertIncidentAssignment = z.infer<typeof insertIncidentAssignmentSchema>;
export type CrewRoster = typeof crewRosters.$inferSelect;
export type InsertCrewRoster = z.infer<typeof insertCrewRosterSchema>;

// Configuration storage for app settings
export const appConfig = pgTable("app_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertAppConfigSchema = createInsertSchema(appConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type AppConfig = typeof appConfig.$inferSelect;
export type InsertAppConfig = z.infer<typeof insertAppConfigSchema>;

// ===== STORM RESPONSE MANAGEMENT SYSTEM TABLES =====
// From Replit Build Prompt — Utility Storm Response Module

// Companies table
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  billingAddress: text("billing_address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// User company access - tracks which UTILITY users have access to which companies
export const userCompanyAccess = pgTable("user_company_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  grantedBy: varchar("granted_by").references(() => users.id), // MANAGER who granted access
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_company_access_user").on(table.userId),
  index("idx_user_company_access_company").on(table.companyId),
]);

// Storm response sessions table
export const stormSessions = pgTable("storm_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  location: text("location").notNull(),
  client: text("client"), // Optional client name
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT, ACTIVE, CLOSED
  isActive: boolean("is_active").default(false).notNull(), // Only one session should be active at a time
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Session contractors (M:N relationship) - links sessions to companies for backward compatibility
export const sessionContractors = pgTable("session_contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  roleHint: text("role_hint"), // e.g., "Line Contractor", "Equipment Supplier"
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Session contractor members (M:N relationship) - links sessions to individual contractors from the contractors database
export const sessionContractorMembers = pgTable("session_contractor_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id, { onDelete: "cascade" }),
  contractorId: integer("contractor_id").notNull().references(() => contractors.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_session_contractor_members_session").on(table.sessionId),
  index("idx_session_contractor_members_contractor").on(table.contractorId),
]);

// User session grants (RBAC per session)
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  roleScope: varchar("role_scope", { length: 20 }).notNull(), // VIEW, APPROVE, ADMIN
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Rosters table
export const rosters = pgTable("rosters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT, SUBMITTED, APPROVED, LOCKED
  lockedBy: varchar("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Crews table
export const crews = pgTable("crews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rosterId: varchar("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
  crewName: text("crew_name").notNull(),
  crewLead: text("crew_lead"),
  workArea: text("work_area"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Roster personnel table
export const rosterPersonnel = pgTable("roster_personnel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rosterId: varchar("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
  crewId: varchar("crew_id").references(() => crews.id),
  personnelId: text("personnel_id"), // Personnel ID from template
  firstName: text("first_name"), // First Name from template
  lastName: text("last_name"), // Last Name from template
  name: text("name").notNull(), // Combined first + last name
  role: text("role"), // Team Type from template
  classification: text("classification"), // Resource Type from template
  rateCode: text("rate_code"),
  gender: text("gender"), // Gender from template
  stOtPtEligibility: text("st_ot_pt_eligibility"), // ST/OT/PT eligibility
  email: text("email"),
  phone: text("phone"), // Cell Phone from template
  teamLead: text("team_lead"), // Team Lead / General Foreman from template
  crewLeadFlag: text("crew_lead_flag"), // Crew Lead / Foreman from template
  departureCity: text("departure_city"), // Departure City from template
  departureState: text("departure_state"), // Departure State from template
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Roster equipment table
export const rosterEquipment = pgTable("roster_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rosterId: varchar("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
  crewId: varchar("crew_id").references(() => crews.id),
  equipmentId: text("equipment_id"), // Equipment ID from template
  equipmentType: text("equipment_type"), // Equipment Type from template
  equipmentDescription: text("equipment_description"), // Equipment Description from template
  type: text("type").notNull(), // Kept for backward compatibility
  classification: text("classification"), // Kept for backward compatibility
  rateCode: text("rate_code"),
  ownership: text("ownership"), // Owned, Leased, Subcontractor
  fuel: text("fuel"), // Equipment Fuel Type from template
  assignedCrewId: text("assigned_crew_id"), // Assigned Equipment Crew ID from template
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Timesheets table - Header information for one crew's timesheet for one day
export const timesheets = pgTable("timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  crewId: varchar("crew_id").references(() => crews.id),
  date: timestamp("date").notNull(),
  
  // Header fields from Excel
  projectName: text("project_name"),
  utilityName: text("utility_name"),
  teamGeneralForeman: text("team_general_foreman"),
  crewForeman: text("crew_foreman"),
  jobLocations: text("job_locations"),
  lodgingProvided: boolean("lodging_provided"),
  crewIdNumber: text("crew_id_number"),
  locationAreaAssigned: text("location_area_assigned"),
  foremanPhone: text("foreman_phone"),
  workDescription: text("work_description"),
  
  // Status and signatures
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT, SUBMITTED, APPROVED, REJECTED, SIGNED
  submittedBy: varchar("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  utilitySignedBy: varchar("utility_signed_by").references(() => users.id),
  utilitySignedAt: timestamp("utility_signed_at"),
  utilityRepName: text("utility_rep_name"),
  
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Timesheet personnel rows - one row per employee per day with work segments as JSON
export const timesheetPersonnel = pgTable("timesheet_personnel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
  rosterPersonnelId: varchar("roster_personnel_id").references(() => rosterPersonnel.id), // Link to roster if available
  employeeName: text("employee_name").notNull(),
  classification: text("classification").notNull(), // GF, Foreman, Lineman, Apprentice, etc.
  segments: jsonb("segments"), // Array of work segments: [{ activityType: 'M'|'D'|'W'|'S', ticketNumber?, startTime, endTime }]
  startTime: text("start_time"), // Primary start time for easy editing (synced with first segment)
  endTime: text("end_time"), // Primary end time for easy editing (synced with first segment)
  totalHours: real("total_hours").default(0),
  mealsProvidedByUtility: integer("meals_provided_by_utility").default(0),
  perDiemMeals: integer("per_diem_meals").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Timesheet equipment rows - equipment used by crew that day
export const timesheetEquipment = pgTable("timesheet_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
  rosterEquipmentId: varchar("roster_equipment_id").references(() => rosterEquipment.id), // Link to roster if available
  equipmentDescription: text("equipment_description").notNull(),
  equipmentNumber: text("equipment_number"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  totalHours: real("total_hours").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Legacy table for backward compatibility - kept for now
export const timesheetLines = pgTable("timesheet_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
  subjectType: varchar("subject_type", { length: 20 }).notNull(), // PERSONNEL, EQUIPMENT
  subjectRefId: varchar("subject_ref_id"), // References roster_personnel.id or roster_equipment.id
  hoursST: real("hours_st").default(0), // Straight time hours
  hoursOT: real("hours_ot").default(0), // Overtime hours
  hoursPT: real("hours_pt").default(0), // Premium time hours
  rateCode: text("rate_code"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Expenses table
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  crewId: varchar("crew_id").references(() => crews.id),
  date: timestamp("date").notNull(),
  category: text("category").notNull(), // Fuel, Lodging, Meals, Equipment Rental, etc.
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(), // Store as cents to avoid floating point errors
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).notNull().default("SUBMITTED"), // SUBMITTED, APPROVED, REJECTED
  submittedBy: varchar("submitted_by").notNull().references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Expense files table
export const expenseFiles = pgTable("expense_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: varchar("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(), // Object storage key
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"), // File size in bytes
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// FTE reports table
export const fteReports = pgTable("fte_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  sessionId: varchar("session_id").references(() => stormSessions.id),
  date: timestamp("date").notNull(),
  payloadJson: jsonb("payload_json").notNull(), // Flexible JSON payload for FTE data
  submittedBy: varchar("submitted_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Company locations table
export const companyLocations = pgTable("company_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  label: text("label").notNull(),
  address: text("address"),
  lat: real("lat"),
  lon: real("lon"),
  typeTag: text("type_tag"), // office, yard, warehouse, etc.
  activeFlag: boolean("active_flag").notNull().default(true),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveTo: timestamp("effective_to"),
  notes: text("notes"),
  source: text("source"), // manual, import, geocoded, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Rate tables
export const rateTables = pgTable("rate_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => stormSessions.id),
  scope: varchar("scope", { length: 20 }).notNull(), // GLOBAL, SESSION
  subject: varchar("subject", { length: 20 }).notNull(), // PERSONNEL, EQUIPMENT
  classification: text("classification").notNull(),
  workType: text("work_type"), // MOBILIZED, WORKING, STANDBY, DEMOBILIZED
  hoursType: varchar("hours_type", { length: 10 }).notNull(), // ST, OT, PT
  rateCents: bigint("rate_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT, ISSUED, PAID
  issuedAt: timestamp("issued_at"),
  dueAt: timestamp("due_at"),
  totalsJson: jsonb("totals_json"), // Flexible JSON for subtotals, taxes, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Invoice lines table
export const invoiceLines = pgTable("invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 20 }).notNull(), // TIMESHEET, EXPENSE
  sourceId: varchar("source_id"), // References timesheets.id or expenses.id
  description: text("description").notNull(),
  qty: real("qty").notNull(),
  unitRateCents: bigint("unit_rate_cents", { mode: "number" }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Audit logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  entity: text("entity").notNull(), // Table name
  entityId: varchar("entity_id").notNull(), // Record ID
  action: varchar("action", { length: 20 }).notNull(), // CREATE, UPDATE, DELETE
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== TICKETING MODULE TABLES =====

export const issueTypes = pgTable("issue_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  defaultPriority: varchar("default_priority", { length: 5 }).notNull().default("P2"),
  defaultRequiredCrewType: text("default_required_crew_type"),
  defaultRequiredEquipment: jsonb("default_required_equipment"),
  closeoutChecklist: jsonb("closeout_checklist"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").references(() => companies.id),
  issueTypeId: varchar("issue_type_id").notNull().references(() => issueTypes.id),
  externalRef: text("external_ref"),
  title: text("title"),
  description: text("description"),
  priority: varchar("priority", { length: 5 }).notNull().default("P2"),
  status: varchar("status", { length: 20 }).notNull().default("CREATED"),
  addressText: text("address_text"),
  lat: real("lat"),
  lon: real("lon"),
  feeder: text("feeder"),
  circuit: text("circuit"),
  safetyFlags: jsonb("safety_flags"),
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("idx_tickets_session").on(table.sessionId),
  index("idx_tickets_company").on(table.companyId),
  index("idx_tickets_status").on(table.status),
  index("idx_tickets_external_ref").on(table.externalRef),
]);

export const ticketAssignments = pgTable("ticket_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  crewId: varchar("crew_id").notNull().references(() => crews.id),
  status: varchar("status", { length: 20 }).notNull().default("PENDING_ACCEPT"),
  assignedByUserId: varchar("assigned_by_user_id").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
  responseNote: text("response_note"),
  isActive: boolean("is_active").notNull().default(true),
});

export const ticketStatusEvents = pgTable("ticket_status_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id),
  oldStatus: varchar("old_status", { length: 20 }),
  newStatus: varchar("new_status", { length: 20 }).notNull(),
  changedByUserId: varchar("changed_by_user_id").notNull().references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  note: text("note"),
});

export const ticketWorkSegments = pgTable("ticket_work_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id),
  sessionId: varchar("session_id").notNull().references(() => stormSessions.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  crewId: varchar("crew_id").notNull().references(() => crews.id),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 30 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }),
  entityId: varchar("entity_id"),
  title: text("title").notNull(),
  body: text("body"),
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});

// Insert schemas and types for Storm Response Management tables
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export const insertStormSessionSchema = createInsertSchema(stormSessions).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true }).extend({
  startDate: z.preprocess((val) => (val === null || val === undefined ? undefined : typeof val === 'string' ? new Date(val) : val), z.date()),
  location: z.string().min(1, "Location is required"),
  client: z.string().optional(),
});
export const insertSessionContractorSchema = createInsertSchema(sessionContractors).omit({ id: true, createdAt: true, deletedAt: true });
export const insertSessionContractorMemberSchema = createInsertSchema(sessionContractorMembers).omit({ id: true, createdAt: true, deletedAt: true });
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true, deletedAt: true });
export const insertRosterSchema = createInsertSchema(rosters).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export const insertCrewSchema = createInsertSchema(crews).omit({ id: true, createdAt: true, deletedAt: true });
export const insertRosterPersonnelSchema = createInsertSchema(rosterPersonnel).omit({ id: true, createdAt: true, deletedAt: true });
export const insertRosterEquipmentSchema = createInsertSchema(rosterEquipment).omit({ id: true, createdAt: true, deletedAt: true });
// Zod schema for work segments validation
export const workSegmentSchema = z.object({
  activityType: z.enum(['M', 'D', 'W', 'S']), // M=Mobilized, D=Demobilized, W=Work, S=Standby
  ticketNumber: z.string().optional(),
  startTime: z.string().optional(), // e.g., "5AM" or "06:00"
  endTime: z.string().optional(),
}).refine(
  (data) => data.activityType !== 'W' || data.ticketNumber,
  { message: "Ticket number required for Work activity", path: ["ticketNumber"] }
);

export const insertTimesheetSchema = createInsertSchema(timesheets).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, submittedAt: true, approvedAt: true, utilitySignedAt: true });
export const insertTimesheetPersonnelSchema = createInsertSchema(timesheetPersonnel).omit({ id: true, createdAt: true, deletedAt: true }).extend({
  segments: z.array(workSegmentSchema).optional(),
});
export const insertTimesheetEquipmentSchema = createInsertSchema(timesheetEquipment).omit({ id: true, createdAt: true, deletedAt: true });
export const insertTimesheetLineSchema = createInsertSchema(timesheetLines).omit({ id: true, createdAt: true, deletedAt: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true }).extend({
  date: z.preprocess((val) => (typeof val === 'string' ? new Date(val) : val), z.date()),
});
export const insertExpenseFileSchema = createInsertSchema(expenseFiles).omit({ id: true, createdAt: true, deletedAt: true });
export const insertFteReportSchema = createInsertSchema(fteReports).omit({ id: true, createdAt: true, deletedAt: true });
export const insertCompanyLocationSchema = createInsertSchema(companyLocations).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export const insertRateTableSchema = createInsertSchema(rateTables).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export const insertInvoiceLineSchema = createInsertSchema(invoiceLines).omit({ id: true, createdAt: true, deletedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// Ticketing module insert schemas
export const insertIssueTypeSchema = createInsertSchema(issueTypes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export const insertTicketAssignmentSchema = createInsertSchema(ticketAssignments).omit({ id: true, assignedAt: true, respondedAt: true });
export const insertTicketStatusEventSchema = createInsertSchema(ticketStatusEvents).omit({ id: true, changedAt: true });
export const insertTicketWorkSegmentSchema = createInsertSchema(ticketWorkSegments).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });

// User schemas and types for Replit Auth
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const insertUserCompanyAccessSchema = createInsertSchema(userCompanyAccess).omit({
  id: true,
  grantedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserCompanyAccess = typeof userCompanyAccess.$inferSelect;
export type InsertUserCompanyAccess = z.infer<typeof insertUserCompanyAccessSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type StormSession = typeof stormSessions.$inferSelect;
export type InsertStormSession = z.infer<typeof insertStormSessionSchema>;
export type SessionContractor = typeof sessionContractors.$inferSelect;
export type InsertSessionContractor = z.infer<typeof insertSessionContractorSchema>;
export type SessionContractorMember = typeof sessionContractorMembers.$inferSelect;
export type InsertSessionContractorMember = z.infer<typeof insertSessionContractorMemberSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type Roster = typeof rosters.$inferSelect;
export type InsertRoster = z.infer<typeof insertRosterSchema>;
export type Crew = typeof crews.$inferSelect;
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type RosterPersonnel = typeof rosterPersonnel.$inferSelect;
export type InsertRosterPersonnel = z.infer<typeof insertRosterPersonnelSchema>;
export type RosterEquipment = typeof rosterEquipment.$inferSelect;
export type InsertRosterEquipment = z.infer<typeof insertRosterEquipmentSchema>;
export type WorkSegment = z.infer<typeof workSegmentSchema>;
export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type TimesheetPersonnel = typeof timesheetPersonnel.$inferSelect;
export type InsertTimesheetPersonnel = z.infer<typeof insertTimesheetPersonnelSchema>;
export type TimesheetEquipment = typeof timesheetEquipment.$inferSelect;
export type InsertTimesheetEquipment = z.infer<typeof insertTimesheetEquipmentSchema>;
export type TimesheetLine = typeof timesheetLines.$inferSelect;
export type InsertTimesheetLine = z.infer<typeof insertTimesheetLineSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type ExpenseFile = typeof expenseFiles.$inferSelect;
export type InsertExpenseFile = z.infer<typeof insertExpenseFileSchema>;
export type FteReport = typeof fteReports.$inferSelect;
export type InsertFteReport = z.infer<typeof insertFteReportSchema>;
export type CompanyLocation = typeof companyLocations.$inferSelect;
export type InsertCompanyLocation = z.infer<typeof insertCompanyLocationSchema>;
export type RateTable = typeof rateTables.$inferSelect;
export type InsertRateTable = z.infer<typeof insertRateTableSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Ticketing module types
export type IssueType = typeof issueTypes.$inferSelect;
export type InsertIssueType = z.infer<typeof insertIssueTypeSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketAssignment = typeof ticketAssignments.$inferSelect;
export type InsertTicketAssignment = z.infer<typeof insertTicketAssignmentSchema>;
export type TicketStatusEvent = typeof ticketStatusEvents.$inferSelect;
export type InsertTicketStatusEvent = z.infer<typeof insertTicketStatusEventSchema>;
export type TicketWorkSegment = typeof ticketWorkSegments.$inferSelect;
export type InsertTicketWorkSegment = z.infer<typeof insertTicketWorkSegmentSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
