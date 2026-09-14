"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { clearStaffSession, getStaffSession } from "@/lib/auth";
import { getEstablishmentBySlug } from "@/lib/db/queries";

export async function logout(slug: string) {
  await clearStaffSession();
  redirect(`/${slug}/pro/login`);
}

export async function togglePrepared(slug: string, orderId: string, currentStatus: string) {
  const session = await getStaffSession();
  const establishment = await getEstablishmentBySlug(slug);
  if (!session || !establishment || session.establishmentId !== establishment.id) {
    redirect(`/${slug}/pro/login`);
  }

  const nextStatus = currentStatus === "completed" ? "confirmed" : "completed";
  await db.update(orders).set({ status: nextStatus, updatedAt: new Date() }).where(eq(orders.id, orderId));
  revalidatePath(`/${slug}/pro`);
}
