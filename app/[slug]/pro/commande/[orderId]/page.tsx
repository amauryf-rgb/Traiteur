import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getEstablishmentBySlug, getOrderWithItems } from "@/lib/db/queries";
import { OrderEditClient } from "./OrderEditClient";

export default async function OrderEditPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const session = await getStaffSession();
  if (!session || session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (session.role === "employee") redirect(`/${slug}/pro`);

  const result = await getOrderWithItems(orderId);
  if (!result || result.order.establishmentId !== establishment.id) notFound();

  return (
    <OrderEditClient
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      order={result.order}
      items={result.items}
    />
  );
}
