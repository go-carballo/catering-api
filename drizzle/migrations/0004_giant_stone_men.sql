ALTER TYPE "public"."outbox_event_status" ADD VALUE 'PROCESSING' BEFORE 'PROCESSED';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_status" ADD VALUE 'DEAD';--> statement-breakpoint
CREATE TABLE "processed_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"handler_name" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
DROP INDEX "ix_outbox_status_created";--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "max_retries" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_processed_event_handler" ON "processed_events" USING btree ("event_id","handler_name");--> statement-breakpoint
CREATE INDEX "ix_processed_events_date" ON "processed_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "ix_outbox_pending" ON "outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ix_outbox_processed_at" ON "outbox_events" USING btree ("processed_at");