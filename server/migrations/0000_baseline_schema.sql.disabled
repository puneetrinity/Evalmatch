CREATE TABLE IF NOT EXISTS "analysis_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"resume_id" integer,
	"job_description_id" integer,
	"match_percentage" real,
	"matched_skills" json,
	"missing_skills" json,
	"analysis" json DEFAULT '{}'::json NOT NULL,
	"candidate_strengths" json,
	"candidate_weaknesses" json,
	"recommendations" json,
	"confidence_level" varchar(10),
	"semantic_similarity" real,
	"skills_similarity" real,
	"experience_similarity" real,
	"education_similarity" real,
	"ml_confidence_score" real,
	"scoring_dimensions" json,
	"fairness_metrics" json,
	"processing_time" integer,
	"ai_provider" varchar(50),
	"model_version" varchar(50),
	"processing_flags" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" varchar(10) NOT NULL,
	"status_code" integer,
	"processing_time" integer,
	"request_size" integer,
	"response_size" integer,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"resume_id" integer,
	"job_description_id" integer,
	"questions" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_descriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"requirements" json,
	"skills" json,
	"experience" text,
	"embedding" json,
	"requirements_embedding" json,
	"analyzed_data" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"session_id" text,
	"batch_id" text,
	"filename" text NOT NULL,
	"file_size" integer,
	"file_type" text,
	"content" text,
	"skills" json,
	"experience" json,
	"education" json,
	"embedding" json,
	"skills_embedding" json,
	"analyzed_data" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 0,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_text" varchar(255) NOT NULL,
	"normalized_skill_text" varchar(255) NOT NULL,
	"frequency" integer DEFAULT 1,
	"esco_validated" boolean DEFAULT false,
	"esco_id" varchar(100),
	"esco_category" varchar(100),
	"groq_confidence" real DEFAULT 0,
	"groq_category" varchar(100),
	"ml_similarity_score" real DEFAULT 0,
	"ml_similar_to" varchar(255),
	"ml_category" varchar(100),
	"auto_approved" boolean DEFAULT false,
	"auto_approval_reason" varchar(50),
	"auto_approval_confidence" real DEFAULT 0,
	"category_suggestion" varchar(100),
	"source_contexts" json DEFAULT '[]'::json,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "skill_memory_skill_text_unique" UNIQUE("skill_text")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_memory_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date DEFAULT now(),
	"total_skills_discovered" integer DEFAULT 0,
	"esco_validated_count" integer DEFAULT 0,
	"auto_approved_count" integer DEFAULT 0,
	"high_frequency_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_promotion_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer,
	"main_skill_id" integer,
	"promotion_reason" varchar(50) NOT NULL,
	"promotion_confidence" real NOT NULL,
	"promotion_data" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"category_id" integer,
	"aliases" json,
	"embedding" json,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_statistics" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total_users" integer DEFAULT 0,
	"total_api_calls" integer DEFAULT 0,
	"unique_active_users" integer DEFAULT 0,
	"average_calls_per_user" real DEFAULT 0,
	"tier_distribution" json DEFAULT '{}'::json,
	"top_endpoints" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_api_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" varchar(50) DEFAULT 'testing' NOT NULL,
	"max_calls" integer DEFAULT 200 NOT NULL,
	"used_calls" integer DEFAULT 0 NOT NULL,
	"reset_period" varchar(20) DEFAULT 'monthly' NOT NULL,
	"last_reset" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_api_limits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_id" text NOT NULL,
	"token_name" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp,
	"total_requests" integer DEFAULT 0,
	CONSTRAINT "user_tokens_token_id_unique" UNIQUE("token_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "skill_promotion_log" ADD CONSTRAINT "skill_promotion_log_skill_id_skill_memory_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill_memory"("id") ON DELETE no action ON UPDATE no action;