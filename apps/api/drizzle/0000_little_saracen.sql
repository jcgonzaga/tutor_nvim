CREATE TABLE "attempt_events" (
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"timestamp_ms" double precision NOT NULL,
	"key" text NOT NULL,
	"code" text,
	"logical_key" text NOT NULL,
	"ctrl" boolean NOT NULL,
	"alt" boolean NOT NULL,
	"shift" boolean NOT NULL,
	"meta" boolean NOT NULL,
	"mode" text NOT NULL,
	"cursor_before_line" integer NOT NULL,
	"cursor_before_column" integer NOT NULL,
	"cursor_after_line" integer NOT NULL,
	"cursor_after_column" integer NOT NULL,
	"accepted" boolean NOT NULL,
	CONSTRAINT "attempt_events_attempt_id_sequence_pk" PRIMARY KEY("attempt_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"session_id" uuid,
	"finished_at" bigint NOT NULL,
	"success" boolean NOT NULL,
	"gave_up" boolean DEFAULT false NOT NULL,
	"strategy" text NOT NULL,
	"performance_score" double precision NOT NULL,
	"metrics" jsonb NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"scheduled_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_skills" (
	"exercise_id" text NOT NULL,
	"skill_slug" text NOT NULL,
	CONSTRAINT "exercise_skills_exercise_id_skill_slug_pk" PRIMARY KEY("exercise_id","skill_slug")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"schema_version" integer NOT NULL,
	"mode" text NOT NULL,
	"difficulty" integer NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "personal_bests" (
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"time" double precision,
	"efficiency" double precision,
	"performance" double precision,
	"reaction" double precision,
	CONSTRAINT "personal_bests_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"user_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"due_at" bigint NOT NULL,
	"stability" double precision NOT NULL,
	CONSTRAINT "review_queue_user_id_skill_slug_pk" PRIMARY KEY("user_id","skill_slug")
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"exercise_id" text NOT NULL,
	"skill_slug" text NOT NULL,
	"block" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"repeat" boolean DEFAULT false NOT NULL,
	"attempt_id" uuid,
	CONSTRAINT "session_exercises_session_id_position_pk" PRIMARY KEY("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"seed" text DEFAULT '' NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"abandoned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_prerequisites" (
	"skill_slug" text NOT NULL,
	"prerequisite_slug" text NOT NULL,
	CONSTRAINT "skill_prerequisites_skill_slug_prerequisite_slug_pk" PRIMARY KEY("skill_slug","prerequisite_slug")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"domain" text NOT NULL,
	"tier" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "skills_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"keyboard_layout" text DEFAULT 'us-ansi' NOT NULL,
	"experience" text,
	"calibration" jsonb,
	"placed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarding_completed_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"stage" text NOT NULL,
	"mastery" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"strategy" double precision NOT NULL,
	"fluency" double precision NOT NULL,
	"retention" double precision NOT NULL,
	"transfer" double precision NOT NULL,
	"attempt_count" integer NOT NULL,
	"last_attempt_at" bigint,
	"next_review_at" bigint,
	"review" jsonb,
	"delayed_recall_count" integer NOT NULL,
	"transfer_count" integer NOT NULL,
	"seen_contexts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skills_user_id_skill_slug_pk" PRIMARY KEY("user_id","skill_slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_skills" ADD CONSTRAINT "exercise_skills_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_skills" ADD CONSTRAINT "exercise_skills_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_prerequisite_slug_skills_slug_fk" FOREIGN KEY ("prerequisite_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_finished_idx" ON "attempts" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE INDEX "attempts_exercise_idx" ON "attempts" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "review_queue_due_idx" ON "review_queue" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "sessions_user_date_idx" ON "sessions" USING btree ("user_id","date");