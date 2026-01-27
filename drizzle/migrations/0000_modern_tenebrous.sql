CREATE TYPE "public"."company_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."company_type" AS ENUM('CATERING', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ACTIVE', 'PAUSED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."service_day_status" AS ENUM('PENDING', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('REMOTE', 'HYBRID', 'ONSITE');--> statement-breakpoint
CREATE TABLE "catering_profiles" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"daily_capacity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_office_days" (
	"client_company_id" uuid NOT NULL,
	"dow" smallint NOT NULL,
	CONSTRAINT "client_office_days_client_company_id_dow_pk" PRIMARY KEY("client_company_id","dow")
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"work_mode" "work_mode" DEFAULT 'HYBRID' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_type" "company_type" NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"status" "company_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_service_days" (
	"contract_id" uuid NOT NULL,
	"dow" smallint NOT NULL,
	CONSTRAINT "contract_service_days_contract_id_dow_pk" PRIMARY KEY("contract_id","dow")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catering_company_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"start_date" date DEFAULT now() NOT NULL,
	"end_date" date,
	"price_per_service" numeric(12, 2) NOT NULL,
	"flexible_quantity" boolean DEFAULT true NOT NULL,
	"min_daily_quantity" integer NOT NULL,
	"max_daily_quantity" integer NOT NULL,
	"notice_period_hours" integer NOT NULL,
	"status" "contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"expected_quantity" integer,
	"served_quantity" integer,
	"expected_confirmed_at" timestamp with time zone,
	"served_confirmed_at" timestamp with time zone,
	"status" "service_day_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catering_profiles" ADD CONSTRAINT "catering_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_office_days" ADD CONSTRAINT "client_office_days_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_service_days" ADD CONSTRAINT "contract_service_days_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_catering_company_id_companies_id_fk" FOREIGN KEY ("catering_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_days" ADD CONSTRAINT "service_days_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_companies_tax_id" ON "companies" USING btree ("tax_id") WHERE "companies"."tax_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_contract_active_pair" ON "contracts" USING btree ("catering_company_id","client_company_id") WHERE "contracts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ix_contracts_client" ON "contracts" USING btree ("client_company_id");--> statement-breakpoint
CREATE INDEX "ix_contracts_catering" ON "contracts" USING btree ("catering_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_service_day" ON "service_days" USING btree ("contract_id","service_date");--> statement-breakpoint
CREATE INDEX "ix_service_days_contract_date" ON "service_days" USING btree ("contract_id","service_date");--> statement-breakpoint
CREATE INDEX "ix_service_days_date" ON "service_days" USING btree ("service_date");