CREATE TABLE "order_item_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"component_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_item_exclusions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_components" ADD COLUMN "type" text DEFAULT 'choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item_exclusions" ADD CONSTRAINT "order_item_exclusions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_exclusions" ADD CONSTRAINT "order_item_exclusions_component_id_product_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."product_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_type_check" CHECK ("product_components"."type" IN ('include', 'choice'));--> statement-breakpoint
CREATE POLICY "order_item_exclusions_tenant_isolation" ON "order_item_exclusions" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "order_items" JOIN "orders" ON "orders"."id" = "order_items"."order_id" WHERE "order_items"."id" = "order_item_exclusions"."order_item_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));