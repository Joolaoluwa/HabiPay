CREATE TYPE "public"."user_role" AS ENUM('tenant', 'landlord', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('employed', 'self_employed', 'contract', 'unemployed', 'student');--> statement-breakpoint
CREATE TYPE "public"."tenant_verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."landlord_verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('available', 'pending', 'occupied');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('flat', 'duplex', 'bungalow', 'self_contain', 'room_and_parlour', 'detached_house', 'semi_detached', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_recommendation" AS ENUM('approve', 'decline', 'manual_review');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'tenant' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"bvn_encrypted" varchar(512),
	"nin_encrypted" varchar(512),
	"bvn_verified" boolean DEFAULT false NOT NULL,
	"nin_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "tenant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employment_status" "employment_status" NOT NULL,
	"employer_name" text,
	"monthly_income" numeric(15, 2),
	"salary_payment_bank" varchar(100),
	"residential_address" text NOT NULL,
	"verification_status" "tenant_verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "landlords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"bank_account_number" varchar(512) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"verification_status" "landlord_verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landlords_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"property_type" "property_type" NOT NULL,
	"annual_rent" numeric(15, 2) NOT NULL,
	"lease_duration_months" integer NOT NULL,
	"status" "property_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"requested_rent_amount" numeric(15, 2) NOT NULL,
	"requested_financing_amount" numeric(15, 2) NOT NULL,
	"tenant_down_payment" numeric(15, 2) NOT NULL,
	"application_status" "application_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"monthly_income" numeric(15, 2) NOT NULL,
	"rent_to_income_ratio" numeric(5, 2) NOT NULL,
	"employer_verified" boolean DEFAULT false NOT NULL,
	"credit_score" integer NOT NULL,
	"affordability_score" integer NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"recommendation" "risk_recommendation" NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_profiles" ADD CONSTRAINT "tenant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenant_profiles_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;