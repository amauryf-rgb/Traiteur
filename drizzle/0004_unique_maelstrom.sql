ALTER TABLE "capacity_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inter_entity_invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_allergens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_capacity_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_lot_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "capacity_reservations_tenant_isolation" ON "capacity_reservations" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "products" WHERE "products"."id" = "capacity_reservations"."product_id" AND "products"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "inter_entity_invoice_lines_tenant_isolation" ON "inter_entity_invoice_lines" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "inter_entity_invoices" WHERE "inter_entity_invoices"."id" = "inter_entity_invoice_lines"."invoice_id" AND "inter_entity_invoices"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "order_items_tenant_isolation" ON "order_items" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "orders" WHERE "orders"."id" = "order_items"."order_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "payments_tenant_isolation" ON "payments" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "orders" WHERE "orders"."id" = "payments"."order_id" AND "orders"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "product_allergens_tenant_isolation" ON "product_allergens" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "products" WHERE "products"."id" = "product_allergens"."product_id" AND "products"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "product_capacity_rules_tenant_isolation" ON "product_capacity_rules" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "products" WHERE "products"."id" = "product_capacity_rules"."product_id" AND "products"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
CREATE POLICY "production_lot_items_tenant_isolation" ON "production_lot_items" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (SELECT 1 FROM "production_lots" WHERE "production_lots"."id" = "production_lot_items"."lot_id" AND "production_lots"."establishment_id"::text = current_setting('app.current_establishment_id', true)));--> statement-breakpoint
ALTER TABLE "capacity_reservations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inter_entity_invoice_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_allergens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_capacity_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_lot_items" FORCE ROW LEVEL SECURITY;