CREATE TABLE "workflow_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"transition_event" varchar(100) NOT NULL,
	"required_role" varchar(100),
	"assigned_user_id" uuid,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"delegated_to" uuid,
	"comments" text,
	"escalation_deadline" timestamp with time zone,
	"escalated_to_role" varchar(100),
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegatee_id" uuid NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_delegated_to_users_id_fk" FOREIGN KEY ("delegated_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_delegations" ADD CONSTRAINT "workflow_delegations_delegator_id_users_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_delegations" ADD CONSTRAINT "workflow_delegations_delegatee_id_users_id_fk" FOREIGN KEY ("delegatee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_scope" ON "workflow_approvals" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_document" ON "workflow_approvals" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_status" ON "workflow_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_assigned" ON "workflow_approvals" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_role" ON "workflow_approvals" USING btree ("required_role");--> statement-breakpoint
CREATE INDEX "idx_workflow_approvals_deadline" ON "workflow_approvals" USING btree ("escalation_deadline");--> statement-breakpoint
CREATE INDEX "idx_workflow_delegations_scope" ON "workflow_delegations" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_delegations_active" ON "workflow_delegations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_workflow_delegations_dates" ON "workflow_delegations" USING btree ("start_date","end_date");