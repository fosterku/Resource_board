CREATE TABLE "analysis_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"status" text NOT NULL,
	"resource_count" integer,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analysis_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"label" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "availability_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer,
	"filename" text,
	"original_name" text,
	"file_path" text,
	"submission_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"records_created" integer DEFAULT 0,
	"errors" text,
	"submitted_by" text NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"submitter_name" text NOT NULL,
	"communication_rating" integer NOT NULL,
	"work_quality_rating" integer NOT NULL,
	"collaboration_rating" integer NOT NULL,
	"documentation_rating" integer NOT NULL,
	"had_conflicts" boolean NOT NULL,
	"conflict_details" text,
	"strengths" text,
	"improvement_areas" text,
	"met_safety_standards" boolean NOT NULL,
	"safety_issues" text,
	"adhered_to_schedule" boolean NOT NULL,
	"schedule_issues" text,
	"would_recommend" boolean NOT NULL,
	"additional_comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"email" text,
	"phone" text,
	"category" text NOT NULL,
	"city" text,
	"state" text,
	"full_address" text,
	"latitude" real,
	"longitude" real,
	"departure_locations" jsonb,
	"bird_rep" text,
	"pipefile" text,
	"avetta" text,
	"sub_ranking" text,
	"fte_counts_per_location" text,
	"pipefile_updates" text,
	"notes" text,
	"new_msa_complete" text DEFAULT '',
	"rating" real DEFAULT 0,
	"needs_review" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"session_id" integer,
	"submission_date" timestamp DEFAULT now() NOT NULL,
	"available_start_date" timestamp NOT NULL,
	"available_end_date" timestamp,
	"departure_location" text,
	"departure_latitude" real,
	"departure_longitude" real,
	"total_fte" integer DEFAULT 0,
	"buckets" integer DEFAULT 0,
	"diggers" integer DEFAULT 0,
	"pickups" integer DEFAULT 0,
	"backyard_machines" integer DEFAULT 0,
	"linemen_count" integer DEFAULT 0,
	"groundmen_count" integer DEFAULT 0,
	"operators_count" integer DEFAULT 0,
	"foreman_count" integer DEFAULT 0,
	"apprentices_count" integer DEFAULT 0,
	"linemen_rate" real,
	"groundmen_rate" real,
	"operators_rate" real,
	"foreman_rate" real,
	"apprentices_rate" real,
	"status" text DEFAULT 'submitted' NOT NULL,
	"notes" text,
	"submitted_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_assignment_id" integer,
	"subcontractor" varchar(100),
	"employee_name" varchar(100) NOT NULL,
	"all_personnel" varchar(50),
	"gender" varchar(10),
	"employee_id" varchar(50),
	"classification" varchar(50),
	"crew_id" varchar(20),
	"location" varchar(100),
	"time_in" varchar(20),
	"equipment_type" varchar(50),
	"equipment_id" varchar(20),
	"equipment_unit_number" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distance_calculations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"analysis_point_id" integer,
	"resource_id" integer,
	"distance" real NOT NULL,
	"duration" integer NOT NULL,
	"route" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "equipment_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"crew_availability_id" integer,
	"equipment_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"specifications" text,
	"daily_rate" real,
	"mobilization_cost" real,
	"available_start_date" timestamp NOT NULL,
	"available_end_date" timestamp,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer,
	"crew_availability_id" integer,
	"assigned_at" timestamp DEFAULT now(),
	"assigned_by" varchar(50) DEFAULT 'admin',
	"status" varchar(20) DEFAULT 'assigned',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'active',
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"priority" varchar(10) DEFAULT 'medium',
	"location" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(50) DEFAULT 'admin'
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"description" text,
	"properties" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"contractor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "availability_submissions" ADD CONSTRAINT "availability_submissions_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_files" ADD CONSTRAINT "contractor_files_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_reviews" ADD CONSTRAINT "contractor_reviews_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_availability" ADD CONSTRAINT "crew_availability_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_availability" ADD CONSTRAINT "crew_availability_session_id_availability_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."availability_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_rosters" ADD CONSTRAINT "crew_rosters_incident_assignment_id_incident_assignments_id_fk" FOREIGN KEY ("incident_assignment_id") REFERENCES "public"."incident_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distance_calculations" ADD CONSTRAINT "distance_calculations_analysis_point_id_analysis_points_id_fk" FOREIGN KEY ("analysis_point_id") REFERENCES "public"."analysis_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distance_calculations" ADD CONSTRAINT "distance_calculations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_availability" ADD CONSTRAINT "equipment_availability_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_availability" ADD CONSTRAINT "equipment_availability_crew_availability_id_crew_availability_id_fk" FOREIGN KEY ("crew_availability_id") REFERENCES "public"."crew_availability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_assignments" ADD CONSTRAINT "incident_assignments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_assignments" ADD CONSTRAINT "incident_assignments_crew_availability_id_crew_availability_id_fk" FOREIGN KEY ("crew_availability_id") REFERENCES "public"."crew_availability"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;