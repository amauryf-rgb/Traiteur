CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"ip_address" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"staff_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_establishment_ip_idx" ON "login_attempts" USING btree ("establishment_id","ip_address","created_at");--> statement-breakpoint
CREATE POLICY "login_attempts_tenant_isolation" ON "login_attempts" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "login_attempts"."establishment_id"::text = current_setting('app.current_establishment_id', true));
--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY : le propriétaire de la table ignore RLS par
-- défaut même sans BYPASSRLS (piège n°2 documenté dans schema.sql, section 11).
ALTER TABLE "login_attempts" FORCE ROW LEVEL SECURITY;