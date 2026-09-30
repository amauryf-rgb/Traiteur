import { EntityBillingForm } from "./EntityBillingForm";
import type { getLegalEntitiesForEstablishment } from "@/lib/db/queries";

type LegalEntity = Awaited<ReturnType<typeof getLegalEntitiesForEstablishment>>[number];

// Coordonnées de facturation par entité — servent à la fois aux factures
// inter-entités (Facturation) et aux factures clients (Dossier), voir
// lib/pdf/ClientInvoiceDocument.tsx et InterEntityInvoiceDocument.tsx qui
// lisent les deux mêmes champs. `entities` est déjà filtrée par page.tsx
// selon allowedEntityId : un owner scopé (Richard/boutique, Michele/traiteur)
// ne reçoit ici que sa propre entité, jamais l'autre.
export function LegalEntitiesSection({ slug, entities, accentColor }: { slug: string; entities: LegalEntity[]; accentColor: string }) {
  return (
    <div className="px-6 py-4 flex flex-col gap-2">
      <p className="text-xs text-stone-400 mb-1">
        Adresse, IBAN et numéro de TVA — utilisés à la fois sur les factures clients et sur les factures
        inter-entités.
      </p>
      {entities.map((entity) => (
        <EntityBillingForm key={entity.id} slug={slug} entity={entity} accentColor={accentColor} />
      ))}
    </div>
  );
}
