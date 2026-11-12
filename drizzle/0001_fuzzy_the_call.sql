ALTER TABLE "disciplinary_decisions" ADD COLUMN "applied_revision" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "disciplinary_decisions" ADD COLUMN "snapshot" jsonb NOT NULL;