CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "allergens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_establishment_email_unique" ON "clients" USING btree ("establishment_id","email");--> statement-breakpoint
CREATE POLICY "allergens_tenant_isolation" ON "allergens" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "allergens"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "cancellation_policies_tenant_isolation" ON "cancellation_policies" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "cancellation_policies"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "categories_tenant_isolation" ON "categories" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "categories"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "inter_entity_invoices_tenant_isolation" ON "inter_entity_invoices" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "inter_entity_invoices"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "legal_entities_tenant_isolation" ON "legal_entities" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "legal_entities"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "notifications"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "orders_tenant_isolation" ON "orders" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "orders"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "production_lots_tenant_isolation" ON "production_lots" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "production_lots"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "products_tenant_isolation" ON "products" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "products"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "staff_members_tenant_isolation" ON "staff_members" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "staff_members"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "clients_tenant_isolation" ON "clients" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "clients"."establishment_id" = current_setting('app.current_establishment_id', true)::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY : sans ça, le propriétaire des tables (le rôle
-- qui a exécuté cette migration) continuerait d'ignorer les policies
-- ci-dessus par défaut, RLS ou pas — non exprimable via l'API Drizzle,
-- ajouté à la main. Sans effet sur un rôle BYPASSRLS (ex. neondb_owner) :
-- seul le passage à un rôle applicatif dédié (app_user) rend tout ça actif.
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "allergens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_lots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cancellation_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;