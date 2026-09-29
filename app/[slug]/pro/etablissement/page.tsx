import { notFound, redirect } from "next/navigation";
import {
  getEstablishmentBySlug,
  getLastLoginByStaffMember,
  getLegalEntitiesForEstablishment,
  getRecentFailedAttempts,
  getStaffForEstablishment,
  getStaffOrderTypeScope,
  getUpcomingClosures,
} from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { getTodayISO } from "@/lib/slots";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { IdentityForm } from "./IdentityForm";
import { TeamSection } from "./TeamSection";
import { ClosuresSection } from "./ClosuresSection";
import { EtablissementTabs, type EtablissementTabKey } from "./EtablissementTabs";
import type { OrderType } from "@/lib/types";

function isTabKey(value: string | undefined): value is EtablissementTabKey {
  return value === "identite" || value === "equipe" || value === "fermetures";
}

export default async function EtablissementPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { tab, error } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { session, context } = staffTenant;

  const today = getTodayISO();

  // Requêtes séquentielles : tx est une connexion unique retenue pour toute
  // la transaction (SET LOCAL), pas un pool — voir même remarque dans
  // l'ancien equipe/page.tsx.
  const { staff, entities, lastLoginByStaffMember, recentFailedAttempts, scope, closures } = await runAsTenant(context, async (tx) => {
    const staff = await getStaffForEstablishment(tx, establishment.id);
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    const lastLoginByStaffMember = await getLastLoginByStaffMember(tx, establishment.id);
    const recentFailedAttempts = await getRecentFailedAttempts(tx, establishment.id);
    const scope = await getStaffOrderTypeScope(tx, session.staffMemberId);
    const closures = await getUpcomingClosures(tx, establishment.id, today);
    return { staff, entities, lastLoginByStaffMember, recentFailedAttempts, scope, closures };
  });

  const accentColor = establishment.accentColor ?? "#1a1a1a";
  // Même choix que l'ancien fermetures/page.tsx : un owner rattaché à un seul
  // univers ne gère que le sien, sans bascule "voir tout".
  const universes: OrderType[] = scope ? [scope] : ["traiteur", "boutique"];

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner
      active="etablissement"
    >
      <ProPanel>
        <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Établissement — {establishment.name}</p>

        <EtablissementTabs
          initialTab={isTabKey(tab) ? tab : "identite"}
          accentColor={accentColor}
          sections={{
            identite: <IdentityForm slug={slug} logoUrl={establishment.logoUrl} bannerUrl={establishment.bannerUrl} accentColor={accentColor} />,
            equipe: (
              <TeamSection
                slug={slug}
                staff={staff}
                entities={entities}
                lastLoginByStaffMember={lastLoginByStaffMember}
                recentFailedAttempts={recentFailedAttempts}
                accentColor={accentColor}
                error={error}
              />
            ),
            fermetures: (
              <ClosuresSection
                slug={slug}
                universes={universes}
                closedWeekdaysByUniverse={{
                  traiteur: establishment.closedWeekdaysTraiteur,
                  boutique: establishment.closedWeekdaysBoutique,
                }}
                closures={closures}
                accentColor={accentColor}
              />
            ),
          }}
        />
      </ProPanel>
    </ProShell>
  );
}
