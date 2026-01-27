CREATE TYPE "public"."outbox_event_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" text NOT NULL,
	"status" "outbox_event_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "ix_outbox_status_created" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ix_outbox_aggregate" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");