CREATE TABLE "order_contacts" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email2" text,
	"phone" text NOT NULL,
	"contact_address_line1" text NOT NULL,
	"contact_address_line2" text,
	"contact_address_postal_code" text NOT NULL,
	"contact_address_city" text NOT NULL,
	"billing_same_as_contact" boolean DEFAULT true NOT NULL,
	"billing_address_line1" text,
	"billing_address_line2" text,
	"billing_address_postal_code" text,
	"billing_address_city" text
);
--> statement-breakpoint
ALTER TABLE "order_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_event_details" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"event_date" date NOT NULL,
	"event_time" time NOT NULL,
	"event_location" text NOT NULL,
	"delivery_mode" text NOT NULL,
	"delivery_address" text,
	"delivery_fee" numeric(10, 2),
	CONSTRAINT "order_event_delivery_mode_check" CHECK ("order_event_details"."delivery_mode" IN ('pickup','delivery'))
);
--> statement-breakpoint
ALTER TABLE "order_event_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_item_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"selected_option_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_item_selections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_component_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_component_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_address_line1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_address_line2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_address_postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_address_city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_same_as_contact" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_address_line1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_address_line2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_address_postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_address_city" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "delivery_fee_default" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "customer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_status" text;--> statement-breakpoint
ALTER TABLE "order_contacts" ADD CONSTRAINT "order_contacts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event_details" ADD CONSTRAINT "order_event_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD CONSTRAINT "order_item_selections_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD CONSTRAINT "order_item_selections_component_id_product_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."product_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD CONSTRAINT "order_item_selections_selected_option_id_product_component_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."product_component_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_component_options" ADD CONSTRAINT "product_component_options_component_id_product_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."product_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "order_quote_status_check" CHECK ("orders"."quote_status" IS NULL OR "orders"."quote_status" IN ('devis_envoye','ajustements_en_cours','confirmee'));--> statement-breakpoint
CREATE POLICY "order_contacts_tenant_isolation" ON "order_contacts" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "orders" WHERE "orders"."id" = "order_contacts"."order_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "order_event_details_tenant_isolation" ON "order_event_details" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "orders" WHERE "orders"."id" = "order_event_details"."order_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "order_item_selections_tenant_isolation" ON "order_item_selections" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "order_items" JOIN "orders" ON "orders"."id" = "order_items"."order_id" WHERE "order_items"."id" = "order_item_selections"."order_item_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "product_component_options_tenant_isolation" ON "product_component_options" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "product_components" JOIN "products" ON "products"."id" = "product_components"."product_id" WHERE "product_components"."id" = "product_component_options"."component_id" AND "products"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "product_components_tenant_isolation" ON "product_components" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "products" WHERE "products"."id" = "product_components"."product_id" AND "products"."establishment_id"::text = current_setting('app.current_establishment_id', true)));