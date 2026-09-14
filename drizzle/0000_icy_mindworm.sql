CREATE TABLE "allergens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_type" text NOT NULL,
	"refundable_days_before" integer,
	"non_refundable_after_hours" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cancellation_order_type_check" CHECK ("cancellation_policies"."order_type" IN ('boutique','traiteur'))
);
--> statement-breakpoint
CREATE TABLE "capacity_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"reservation_date" date NOT NULL,
	"time_slot" time,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capacity_reservation_status_check" CHECK ("capacity_reservations"."status" IN ('held','confirmed','released'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text,
	"logo_url" text,
	"banner_url" text,
	"accent_color" text,
	"custom_domain" text,
	"onboarding_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "establishments_slug_unique" UNIQUE("slug"),
	CONSTRAINT "onboarding_status_check" CHECK ("establishments"."onboarding_status" IN ('draft','payment_pending','active','suspended'))
);
--> statement-breakpoint
CREATE TABLE "inter_entity_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_id" uuid,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"included" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inter_entity_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pdf_url" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inter_entity_invoice_status_check" CHECK ("inter_entity_invoices"."status" IN ('draft','generated'))
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_label" text,
	"uid_number" text,
	"vat_number" text,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid,
	"recipient_type" text NOT NULL,
	"recipient_id" text,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_recipient_type_check" CHECK ("notifications"."recipient_type" IN ('client','staff_member')),
	CONSTRAINT "notification_channel_check" CHECK ("notifications"."channel" IN ('email','sms','push'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"unit_price_snapshot" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_item_quantity_check" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_type" text NOT NULL,
	"selling_entity_id" uuid NOT NULL,
	"executing_entity_id" uuid,
	"client_name" text NOT NULL,
	"client_contact" text,
	"pickup_date" date NOT NULL,
	"pickup_time" time NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"currency" text DEFAULT 'CHF' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"deposit_amount" numeric(10, 2),
	"paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cancellation_policy_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_type_check" CHECK ("orders"."order_type" IN ('boutique','traiteur')),
	CONSTRAINT "order_status_check" CHECK ("orders"."status" IN ('pending_payment','confirmed','in_progress','completed','cancelled')),
	CONSTRAINT "order_payment_status_check" CHECK ("orders"."payment_status" IN ('unpaid','deposit_paid','paid','refunded_partial','refunded_full'))
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"psp_provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psp_provider_check" CHECK ("payment_accounts"."psp_provider" IN ('stripe','payrexx','wallee','other')),
	CONSTRAINT "payment_account_status_check" CHECK ("payment_accounts"."status" IN ('pending','active','restricted','disabled'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"platform_fee_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"refund_keeps_fee" boolean DEFAULT true,
	"external_payment_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_type_check" CHECK ("payments"."type" IN ('deposit','full','balance','refund')),
	CONSTRAINT "payment_status_check" CHECK ("payments"."status" IN ('pending','succeeded','failed'))
);
--> statement-breakpoint
CREATE TABLE "product_allergens" (
	"product_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_capacity_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"max_quantity" integer NOT NULL,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	CONSTRAINT "capacity_scope_check" CHECK ("product_capacity_rules"."scope" IN ('per_day','per_slot'))
);
--> statement-breakpoint
CREATE TABLE "production_lot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity_covered" integer NOT NULL,
	CONSTRAINT "lot_item_quantity_check" CHECK ("production_lot_items"."quantity_covered" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"production_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"ready_by_time" time NOT NULL,
	"assigned_to" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_lot_status_check" CHECK ("production_lots"."status" IN ('pending','in_progress','done'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"price_amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'CHF' NOT NULL,
	"photo_url" text,
	"available_boutique" boolean DEFAULT true NOT NULL,
	"available_traiteur" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"legal_entity_id" uuid,
	"name" text NOT NULL,
	"initials" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"access_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_access_code_unique" UNIQUE("access_code"),
	CONSTRAINT "staff_role_check" CHECK ("staff_members"."role" IN ('owner','manager','employee'))
);
--> statement-breakpoint
ALTER TABLE "allergens" ADD CONSTRAINT "allergens_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_reservations" ADD CONSTRAINT "capacity_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_invoice_lines" ADD CONSTRAINT "inter_entity_invoice_lines_invoice_id_inter_entity_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."inter_entity_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_invoice_lines" ADD CONSTRAINT "inter_entity_invoice_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" ADD CONSTRAINT "inter_entity_invoices_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" ADD CONSTRAINT "inter_entity_invoices_from_entity_id_legal_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" ADD CONSTRAINT "inter_entity_invoices_to_entity_id_legal_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_selling_entity_id_legal_entities_id_fk" FOREIGN KEY ("selling_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_executing_entity_id_legal_entities_id_fk" FOREIGN KEY ("executing_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_account_id_payment_accounts_id_fk" FOREIGN KEY ("payment_account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergens" ADD CONSTRAINT "product_allergens_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_allergens" ADD CONSTRAINT "product_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_capacity_rules" ADD CONSTRAINT "product_capacity_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lot_items" ADD CONSTRAINT "production_lot_items_lot_id_production_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."production_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lot_items" ADD CONSTRAINT "production_lot_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_assigned_to_staff_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_policies_unique" ON "cancellation_policies" USING btree ("establishment_id","order_type");--> statement-breakpoint
CREATE INDEX "idx_capacity_reservations_active" ON "capacity_reservations" USING btree ("product_id","reservation_date","time_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_entity_psp_unique" ON "payment_accounts" USING btree ("legal_entity_id","psp_provider");--> statement-breakpoint
CREATE INDEX "product_allergens_pk" ON "product_allergens" USING btree ("product_id","allergen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_capacity_rules_unique" ON "product_capacity_rules" USING btree ("product_id","scope");