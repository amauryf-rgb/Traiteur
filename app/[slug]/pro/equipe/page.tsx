import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getLegalEntitiesForEstablishment, getStaffForEstablishment } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AddStaffForm } from "./AddStaffForm";
import { removeStaffMember } from "./actions";

const ROLE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  owner: { label: "Propriétaire", tone: "success" },
  manager: { label: "Manager", tone: "info" },
  employee: { label: "Employé", tone: "neutral" },
};

export default async function EquipePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { context } = staffTenant;

  // Requêtes séquentielles : tx est une connexion unique retenue pour toute
  // la transaction (SET LOCAL), pas un pool — deux requêtes concurrentes sur
  // le même client PostgreSQL ne sont pas supportées par node-postgres.
  const { staff, entities } = await runAsTenant(context, async (tx) => {
    const staff = await getStaffForEstablishment(tx, establishment.id);
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    return { staff, entities };
  });
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <main className="max-w-2xl mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 text-white" style={{ backgroundColor: accentColor }}>
        <p className="font-serif text-sm">Équipe — {establishment.name}</p>
        <Link href={`/${slug}/pro`} className="text-xs text-white/80 hover:text-white underline">
          Retour au planning
        </Link>
      </div>

      {error === "last_owner" && (
        <p className="mx-6 mt-4 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          Impossible de supprimer le dernier propriétaire de l&apos;établissement.
        </p>
      )}

      <div className="divide-y divide-stone-200">
        {staff.map((member) => (
          <div key={member.id} className="px-6 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{member.name}</p>
                <Badge tone={ROLE_BADGE[member.role]?.tone ?? "neutral"}>{ROLE_BADGE[member.role]?.label ?? member.role}</Badge>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {entityById.get(member.legalEntityId ?? "")?.name ?? "Aucune entité"} · code {member.accessCode}
              </p>
            </div>
            <form action={removeStaffMember.bind(null, slug, member.id)}>
              <button type="submit" className="text-xs text-red-600 hover:text-red-800 underline whitespace-nowrap">
                Supprimer
              </button>
            </form>
          </div>
        ))}
        {staff.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucun membre d&apos;équipe.</p>}
      </div>

      <div className="px-6 py-4 border-t border-stone-200">
        <p className="text-xs text-stone-400 mb-3">Ajouter un membre</p>
        <AddStaffForm slug={slug} entities={entities.map((e) => ({ id: e.id, name: e.name }))} accentColor={accentColor} />
      </div>
    </main>
  );
}
