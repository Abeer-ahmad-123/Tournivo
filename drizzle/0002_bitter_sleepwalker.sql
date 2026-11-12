CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
