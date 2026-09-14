// Point d'abstraction PSP : Stripe Connect (Standard) ou PSP suisse à Split
// Payment (Payrexx, Wallee) — voir payment_accounts.psp_provider dans le
// schéma. Aucune intégration réelle à ce stade ; simule un encaissement
// immédiat réussi pour permettre de construire le parcours de commande
// complet avant de brancher un vrai prestataire.
export type SimulatedPaymentResult = {
  externalPaymentId: string;
  status: "succeeded";
};

export async function createSimulatedPayment(pspProvider: string): Promise<SimulatedPaymentResult> {
  return {
    externalPaymentId: `sim_${pspProvider}_${crypto.randomUUID()}`,
    status: "succeeded",
  };
}
