CREATE TABLE "establishment_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishment_closures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "closed_weekdays" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "establishment_closures" ADD CONSTRAINT "establishment_closures_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "establishment_closures_unique" ON "establishment_closures" USING btree ("establishment_id","date");--> statement-breakpoint
CREATE POLICY "establishment_closures_tenant_isolation" ON "establishment_closures" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.is_platform_admin', true) = 'true' OR "establishment_closures"."establishment_id"::text = current_setting('app.current_establishment_id', true));
--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY : le propriétaire de la table ignore RLS par
-- défaut même sans BYPASSRLS (piège n°2 documenté dans schema.sql, section 11).
ALTER TABLE "establishment_closures" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- LabTraiteur est fermé le dimanche (0) et le lundi (1) — valeur réelle à
-- migrer pour cet établissement précis, pas un champ vide laissé à
-- configurer manuellement après coup.
UPDATE "establishments" SET "closed_weekdays" = '{0,1}' WHERE "slug" = 'labtraiteur';