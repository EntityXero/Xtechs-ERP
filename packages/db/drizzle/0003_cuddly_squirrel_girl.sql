CREATE TABLE "document_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" varchar(500),
	"quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"unit_price" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"amount" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"source_doc_id" uuid NOT NULL,
	"target_doc_id" uuid NOT NULL,
	"relation_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_doc_links_composite" UNIQUE("source_doc_id","target_doc_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"prefix" varchar(100) NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_doc_sequences_prefix" UNIQUE("tenant_id","business_id","branch_id","type","prefix")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"document_number" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"workflow_state" varchar(50) DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_activities" ADD CONSTRAINT "document_activities_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_activities" ADD CONSTRAINT "document_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_source_doc_id_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_target_doc_id_documents_id_fk" FOREIGN KEY ("target_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_doc_activities_document" ON "document_activities" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_attachments_document" ON "document_attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_comments_document" ON "document_comments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_lines_document" ON "document_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_lines_scope" ON "document_lines" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_doc_links_source" ON "document_links" USING btree ("source_doc_id");--> statement-breakpoint
CREATE INDEX "idx_doc_links_target" ON "document_links" USING btree ("target_doc_id");--> statement-breakpoint
CREATE INDEX "idx_documents_scope" ON "documents" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_documents_type_status" ON "documents" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_documents_number" ON "documents" USING btree ("tenant_id","business_id","document_number");--> statement-breakpoint
CREATE INDEX "idx_documents_assigned" ON "documents" USING btree ("assigned_to");