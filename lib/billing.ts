import type { legalEntities } from "./db/schema";

type LegalEntity = typeof legalEntities.$inferSelect;

export function hasBillingAddress(entity: LegalEntity): boolean {
  return Boolean(entity.addressLine1?.trim() && entity.addressPostalCode?.trim() && entity.addressCity?.trim());
}

// Modèle complet : adresse + IBAN — ce qu'il faut pour qu'une entité puisse
// ÉMETTRE une facture (son IBAN est celui affiché comme moyen de paiement).
// Utilisé comme indicateur générique sur l'écran de réglages ; le contrôle
// réel avant génération PDF est plus fin, voir getPdfBlockReason ci-dessous
// (le destinataire n'a besoin que de son adresse, pas de son IBAN).
export function isBillingProfileComplete(entity: LegalEntity): boolean {
  return hasBillingAddress(entity) && Boolean(entity.ibanNumber?.trim());
}

// Contrôle avant génération du PDF d'une facture inter-entités : l'émettrice
// doit avoir un modèle complet (adresse + IBAN, pour être payée), la
// destinataire n'a besoin que d'une adresse (elle apparaît comme "adressée
// à", son IBAN à elle n'a rien à faire sur ce document). Retourne l'entité
// fautive à compléter, ou null si tout est en ordre.
export function getPdfBlockReason(fromEntity: LegalEntity, toEntity: LegalEntity): LegalEntity | null {
  if (!isBillingProfileComplete(fromEntity)) return fromEntity;
  if (!hasBillingAddress(toEntity)) return toEntity;
  return null;
}
