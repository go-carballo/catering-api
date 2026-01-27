ALTER TABLE "companies" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "password_hash" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_companies_email" ON "companies" USING btree ("email");