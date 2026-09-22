DROP INDEX "establishment_closures_unique";--> statement-breakpoint
ALTER TABLE "establishment_closures" ADD COLUMN "order_type" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "closed_weekdays_traiteur" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "closed_weekdays_boutique" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Reprise des fermetures hebdomadaires existantes dans les deux nouvelles
-- colonnes : un établissement mono-entité (le seul cas en production
-- aujourd'hui) continue d'avoir les mêmes jours fermés pour les deux
-- univers tant que personne ne les dissocie explicitement depuis /pro/fermetures.
UPDATE "establishments" SET "closed_weekdays_traiteur" = "closed_weekdays", "closed_weekdays_boutique" = "closed_weekdays";--> statement-breakpoint
CREATE UNIQUE INDEX "establishment_closures_unique" ON "establishment_closures" USING btree ("establishment_id","date","order_type");--> statement-breakpoint
ALTER TABLE "establishment_closures" ADD CONSTRAINT "establishment_closures_order_type_check" CHECK ("establishment_closures"."order_type" IN ('traiteur','boutique'));