CREATE TYPE "public"."admin_action_type" AS ENUM('approve', 'decline', 'flag', 'edit');--> statement-breakpoint
CREATE TYPE "public"."mandate_status" AS ENUM('active', 'inactive', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('id_card', 'bank_statement', 'employment_letter', 'tenancy_agreement');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('approval', 'repayment_reminder', 'payment_success', 'payment_failed');--> statement-breakpoint
CREATE TYPE "public"."sent_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('paystack', 'flutterwave', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'successful', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('down_payment', 'repayment', 'landlord_payout', 'late_fee');--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('pending', 'paid', 'partial', 'late', 'defaulted');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"action_type" "admin_action_type" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_debit_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financing_offer_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"mandate_reference" varchar(255),
	"status" "mandate_status" DEFAULT 'inactive' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_debit_mandates_mandate_reference_unique" UNIQUE("mandate_reference")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"document_type" "document_type" NOT NULL,
	"file_url" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financing_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"approved_rent_amount" numeric(15, 2) NOT NULL,
	"approved_financing_amount" numeric(15, 2) NOT NULL,
	"down_payment_amount" numeric(15, 2) NOT NULL,
	"financing_fee" numeric(15, 2) NOT NULL,
	"total_repayment_amount" numeric(15, 2) NOT NULL,
	"repayment_months" integer NOT NULL,
	"monthly_installment" numeric(15, 2) NOT NULL,
	"offer_status" "offer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "landlord_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"payout_amount" numeric(15, 2) NOT NULL,
	"payment_reference" varchar(255),
	"payout_status" "payout_status" DEFAULT 'pending' NOT NULL,
	"payout_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_payouts_payment_reference_unique" UNIQUE("payment_reference")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"subject" varchar(255),
	"message" text NOT NULL,
	"sent_status" "sent_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"repayment_schedule_id" uuid,
	"payment_type" "payment_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_provider" "payment_provider" NOT NULL,
	"provider_reference" varchar(255) NOT NULL,
	"payment_status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
CREATE TABLE "repayment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financing_offer_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_due" numeric(15, 2) NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"late_fee_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"payment_status" "installment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repayment_schedules_offer_installment_unique" UNIQUE("financing_offer_id","installment_number")
);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_debit_mandates" ADD CONSTRAINT "auto_debit_mandates_financing_offer_id_financing_offers_id_fk" FOREIGN KEY ("financing_offer_id") REFERENCES "public"."financing_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_offers" ADD CONSTRAINT "financing_offers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_payouts" ADD CONSTRAINT "landlord_payouts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_repayment_schedule_id_repayment_schedules_id_fk" FOREIGN KEY ("repayment_schedule_id") REFERENCES "public"."repayment_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repayment_schedules" ADD CONSTRAINT "repayment_schedules_financing_offer_id_financing_offers_id_fk" FOREIGN KEY ("financing_offer_id") REFERENCES "public"."financing_offers"("id") ON DELETE restrict ON UPDATE no action;