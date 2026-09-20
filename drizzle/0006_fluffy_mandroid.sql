-- Nullable d'abord : les factures déjà générées en production n'ont pas de
-- numéro. On les rétro-numérote ci-dessous avant de poser le NOT NULL.
ALTER TABLE "inter_entity_invoices" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address_postal_code" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address_country" text DEFAULT 'CH';--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "iban_number" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "bank_name" text;--> statement-breakpoint
-- Rétro-numérotation des factures existantes : séquentiel par établissement
-- et par année de création, dans l'ordre chronologique — même format que
-- nextInvoiceNumber() dans facturation/actions.ts pour les futures factures.
WITH numbered AS (
  SELECT id, 'F-' || EXTRACT(YEAR FROM created_at) || '-' || LPAD(
    ROW_NUMBER() OVER (
      PARTITION BY establishment_id, EXTRACT(YEAR FROM created_at)
      ORDER BY created_at
    )::text, 4, '0'
  ) AS number
  FROM "inter_entity_invoices"
)
UPDATE "inter_entity_invoices" AS i SET invoice_number = numbered.number
FROM numbered WHERE numbered.id = i.id;--> statement-breakpoint
ALTER TABLE "inter_entity_invoices" ALTER COLUMN "invoice_number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inter_entity_invoices_number_unique" ON "inter_entity_invoices" USING btree ("establishment_id","invoice_number");