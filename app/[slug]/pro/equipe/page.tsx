import { notFound, redirect } from "next/navigation";
import {
  getEstablishmentBySlug,
  getLastLoginByStaffMember,
  getLegalEntitiesForEstablishment,
  getRecentFailedAttempts,
  getStaffForEstablishment,
} from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { AddStaffForm } from "./AddStaffForm";
import { removeStaffMember, resetStaffAccessCode } from "./actions";

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
  const { session, context } = staffTenant;

  // Requêtes séquentielles : tx est une connexion unique retenue pour toute
  // la transaction (SET LOCAL), pas un pool — deux requêtes concurrentes sur
  // le même client PostgreSQL ne sont pas supportées par node-postgres.
  const { staff, entities, lastLoginByStaffMember, recentFailedAttempts } = await runAsTenant(context, async (tx) => {
    const staff = await getStaffForEstablishment(tx, establishment.id);
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    const lastLoginByStaffMember = await getLastLoginByStaffMember(tx, establishment.id);
    const recentFailedAttempts = await getRecentFailedAttempts(tx, establishment.id);
    return { staff, entities, lastLoginByStaffMember, recentFailedAttempts };
  });
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner
      active="equipe"
    >
    <ProPanel>
      <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Équipe — {establishment.name}</p>

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
              <p className="text-xs text-stone-400 mt-0.5">
                {lastLoginByStaffMember.has(member.id)
                  ? `Dernière connexion : ${dateTimeFormatter.format(lastLoginByStaffMember.get(member.id))}`
                  : "Jamais connecté"}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <form action={resetStaffAccessCode.bind(null, slug, member.id)}>
                <button type="submit" className="text-xs text-stone-500 hover:text-stone-700 underline whitespace-nowrap">
                  Réinitialiser le code
                </button>
              </form>
              <form action={removeStaffMember.bind(null, slug, member.id)}>
                <button type="submit" className="text-xs text-red-600 hover:text-red-800 underline whitespace-nowrap">
                  Supprimer
                </button>
              </form>
            </div>
          </div>
        ))}
        {staff.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucun membre d&apos;équipe.</p>}
      </div>

      <div className="px-6 py-4 border-t border-stone-200">
        <p className="text-xs text-stone-400 mb-3">
          Tentatives de connexion échouées récentes {recentFailedAttempts.length > 0 && `(${recentFailedAttempts.length})`}
        </p>
        {recentFailedAttempts.length === 0 ? (
          <p className="text-xs text-stone-300">Aucune tentative échouée récemment.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {recentFailedAttempts.map((attempt, i) => (
              <p key={i} className="text-xs text-stone-500">
                {dateTimeFormatter.format(attempt.createdAt)} · depuis {attempt.ipAddress}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-stone-200">
        <p className="text-xs text-stone-400 mb-3">Ajouter un membre</p>
        <AddStaffForm slug={slug} entities={entities.map((e) => ({ id: e.id, name: e.name }))} accentColor={accentColor} />
      </div>
    </ProPanel>
    </ProShell>
  );
}
