CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"parent_id" uuid,
	"is_group" boolean DEFAULT false NOT NULL,
	"currency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_accounts_code" UNIQUE("tenant_id","business_id","branch_id","code")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_no" varchar(100) NOT NULL,
	"expiry_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_batches_no" UNIQUE("tenant_id","business_id","branch_id","item_id","batch_no")
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1.000000' NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_currencies_code" UNIQUE("tenant_id","business_id","branch_id","code")
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fiscal_years_name" UNIQUE("tenant_id","business_id","branch_id","name")
);
--> statement-breakpoint
CREATE TABLE "item_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_item_groups_name" UNIQUE("tenant_id","business_id","branch_id","name")
);
--> statement-breakpoint
CREATE TABLE "item_uoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"uom" varchar(50) NOT NULL,
	"conversion_factor" numeric(18, 6) DEFAULT '1.000000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_item_uoms_composite" UNIQUE("tenant_id","business_id","branch_id","item_id","uom")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sku" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"item_group_id" uuid NOT NULL,
	"base_uom" varchar(50) NOT NULL,
	"valuation_method" varchar(50) DEFAULT 'moving_average' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_items_sku" UNIQUE("tenant_id","business_id","branch_id","sku")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"description" varchar(1000) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"reversal_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"credit" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"base_debit" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"base_credit" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1.000000' NOT NULL,
	"exchange_rate_date" timestamp with time zone,
	"exchange_rate_source" varchar(255),
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"batch_id" uuid,
	"on_hand" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"reserved" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"available" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"total_value" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_stock_balances_composite" UNIQUE("tenant_id","business_id","branch_id","item_id","warehouse_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"batch_id" uuid,
	"posting_date" timestamp with time zone NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"uom" varchar(50) NOT NULL,
	"conversion_factor" numeric(18, 6) DEFAULT '1.000000' NOT NULL,
	"valuation_rate" numeric(18, 4) NOT NULL,
	"total_value" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"parent_id" uuid,
	"is_group" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_warehouses_code" UNIQUE("tenant_id","business_id","branch_id","code")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_parent_id_item_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."item_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_uoms" ADD CONSTRAINT "item_uoms_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_group_id_item_groups_id_fk" FOREIGN KEY ("item_group_id") REFERENCES "public"."item_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_journal_entries_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_parent_id_warehouses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_scope" ON "accounts" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_parent" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_batches_scope" ON "batches" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_batches_item" ON "batches" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_currencies_scope" ON "currencies" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_fiscal_years_scope" ON "fiscal_years" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_item_groups_scope" ON "item_groups" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_item_groups_parent" ON "item_groups" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_item_uoms_scope" ON "item_uoms" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_item_uoms_item" ON "item_uoms" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_items_scope" ON "items" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_items_item_group" ON "items" USING btree ("item_group_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_scope" ON "journal_entries" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_date" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_status" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_lines_scope" ON "journal_entry_lines" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_lines_entry" ON "journal_entry_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_lines_account" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_stock_balances_scope" ON "stock_balances" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_balances_item_wh" ON "stock_balances" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_stock_balances_batch" ON "stock_balances" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_scope" ON "stock_ledger" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_item_wh" ON "stock_ledger" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_batch" ON "stock_ledger" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_posting" ON "stock_ledger" USING btree ("posting_date");--> statement-breakpoint
CREATE INDEX "idx_warehouses_scope" ON "warehouses" USING btree ("tenant_id","business_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_warehouses_parent" ON "warehouses" USING btree ("parent_id");