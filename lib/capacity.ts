import { and, eq, inArray, sql } from "drizzle-orm";
import { capacityReservations, productCapacityRules } from "./db/schema";
import type { db } from "./db";

// Transaction scopée : toutes les opérations de ce fichier doivent être
// appelées à l'intérieur d'un db.transaction(...) pour garantir l'atomicité
// vérification + réservation exigée par l'architecture (jamais deux étapes
// séparées — voir capacity_reservations dans schema.sql).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const HOLD_DURATION_MS = 10 * 60 * 1000;

type HoldParams = {
  productId: string;
  date: string;
  time: string;
  quantity: number;
};

type HoldResult =
  | { ok: true; reservationId: string; expiresAt: Date }
  | { ok: false; scope: "per_day" | "per_slot" };

// Verrouille les règles de capacité du produit (FOR UPDATE) puis vérifie et
// insère la réservation dans la même transaction, pour empêcher deux clients
// de réserver simultanément le dernier créneau disponible.
export async function holdCapacity(tx: Tx, params: HoldParams): Promise<HoldResult> {
  const rules = await tx
    .select()
    .from(productCapacityRules)
    .where(eq(productCapacityRules.productId, params.productId))
    .for("update");

  for (const rule of rules) {
    const conditions = [
      eq(capacityReservations.productId, params.productId),
      eq(capacityReservations.reservationDate, params.date),
      sql`(${capacityReservations.status} = 'confirmed' OR (${capacityReservations.status} = 'held' AND ${capacityReservations.expiresAt} > now()))`,
    ];
    if (rule.scope === "per_slot") {
      conditions.push(eq(capacityReservations.timeSlot, params.time));
    }

    const [{ used }] = await tx
      .select({ used: sql<string>`coalesce(sum(${capacityReservations.quantity}), 0)` })
      .from(capacityReservations)
      .where(and(...conditions));

    if (Number(used) + params.quantity > rule.maxQuantity) {
      return { ok: false, scope: rule.scope as "per_day" | "per_slot" };
    }
  }

  const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
  const [reservation] = await tx
    .insert(capacityReservations)
    .values({
      productId: params.productId,
      reservationDate: params.date,
      timeSlot: params.time,
      quantity: params.quantity,
      status: "held",
      expiresAt,
    })
    .returning({ id: capacityReservations.id });

  return { ok: true, reservationId: reservation.id, expiresAt };
}

// Confirme des réservations "held" existantes et les rattache à la commande
// une fois le paiement (simulé) réussi. Échoue si l'une d'elles a expiré ou
// a déjà été libérée, pour ne jamais confirmer un créneau qui n'est plus garanti.
export async function confirmReservations(
  tx: Tx,
  reservationIds: string[],
  orderId: string
): Promise<{ ok: true } | { ok: false }> {
  if (reservationIds.length === 0) return { ok: true };

  const held = await tx
    .select()
    .from(capacityReservations)
    .where(inArray(capacityReservations.id, reservationIds))
    .for("update");

  const allValid =
    held.length === reservationIds.length &&
    held.every((r) => r.status === "held" && r.expiresAt.getTime() > Date.now());

  if (!allValid) return { ok: false };

  await tx
    .update(capacityReservations)
    .set({ status: "confirmed", orderId })
    .where(inArray(capacityReservations.id, reservationIds));

  return { ok: true };
}
