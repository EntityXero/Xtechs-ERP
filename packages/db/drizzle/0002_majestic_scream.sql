CREATE TABLE "metadata_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_defs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "metadata_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_def_id" uuid NOT NULL,
	"target_def_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_metadata_deps_composite" UNIQUE("source_def_id","target_def_id")
);
--> statement-breakpoint
CREATE TABLE "metadata_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"def_id" uuid NOT NULL,
	"tenant_id" uuid,
	"business_id" uuid,
	"branch_id" uuid,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metadata_dependencies" ADD CONSTRAINT "metadata_dependencies_source_def_id_metadata_defs_id_fk" FOREIGN KEY ("source_def_id") REFERENCES "public"."metadata_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_dependencies" ADD CONSTRAINT "metadata_dependencies_target_def_id_metadata_defs_id_fk" FOREIGN KEY ("target_def_id") REFERENCES "public"."metadata_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_revisions" ADD CONSTRAINT "metadata_revisions_def_id_metadata_defs_id_fk" FOREIGN KEY ("def_id") REFERENCES "public"."metadata_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_metadata_defs_key" ON "metadata_defs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_metadata_defs_type" ON "metadata_defs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_metadata_deps_source" ON "metadata_dependencies" USING btree ("source_def_id");--> statement-breakpoint
CREATE INDEX "idx_metadata_deps_target" ON "metadata_dependencies" USING btree ("target_def_id");--> statement-breakpoint
CREATE INDEX "idx_metadata_revs_def_scope" ON "metadata_revisions" USING btree ("def_id","tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_metadata_revs_lookup" ON "metadata_revisions" USING btree ("def_id","tenant_id","business_id","branch_id","version");