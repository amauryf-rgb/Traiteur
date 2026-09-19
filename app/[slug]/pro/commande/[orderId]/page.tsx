import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getOrderWithItems } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { OrderEditClient } from "./OrderEditClient";

export default async function OrderEditPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role === "employee") redirect(`/${slug}/pro`);
  const { context } = staffTenant;

  const result = await runAsTenant(context, (tx) => getOrderWithItems(tx, orderId));
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
