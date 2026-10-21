CREATE TABLE "user_gamification" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"baseline_xp" integer DEFAULT 0 NOT NULL,
	"baseline_best_combo" integer DEFAULT 0 NOT NULL,
	"baseline_streak" jsonb
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "started_ms" double precision;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "local_day" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "combo_after" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "improved" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "bonus_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_gamification" ADD CONSTRAINT "user_gamification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;