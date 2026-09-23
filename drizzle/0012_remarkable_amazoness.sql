CREATE TABLE "client_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"selling_entity_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"email_sent_at" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"invoice_date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"scan_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_selling_entity_id_legal_entities_id_fk" FOREIGN KEY ("selling_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_invoices_order_unique" ON "client_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_invoices_number_unique" ON "client_invoices" USING btree ("establishment_id","invoice_number");--> statement-breakpoint
CREATE POLICY "client_invoices_tenant_isolation" ON "client_invoices" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "client_invoices"."establishment_id"::text = current_setting('app.current_establishment_id', true));--> statement-breakpoint
CREATE POLICY "purchase_invoices_tenant_isolation" ON "purchase_invoices" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "purchase_invoices"."establishment_id"::text = current_setting('app.current_establishment_id', true));
--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY : le propriétaire de la table ignore RLS par
-- défaut même sans BYPASSRLS (piège n°2 documenté dans schema.sql, section 11).
ALTER TABLE "client_invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "purchase_invoices" FORCE ROW LEVEL SECURITY;