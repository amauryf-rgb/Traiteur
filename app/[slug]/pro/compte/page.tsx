import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { requireStaffTenantContext } from "@/lib/tenant";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { ChangeAccessCodeForm } from "./ChangeAccessCodeForm";

// Accessible à tout membre de l'équipe connecté, quel que soit son rôle —
// contrairement à /pro/equipe (réservé owner), chacun ne gère ici que son
// propre compte.
export default async function ComptePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  const { session } = staffTenant;

  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner={session.role === "owner"}
      active="compte"
    >
      <div className="max-w-md">
        <ProPanel>
          <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Mon compte — {session.name}</p>
          <div className="px-6 py-4 border-b border-stone-200">
            <p className="text-xs text-stone-400 mb-3">Changer mon code d&apos;accès</p>
            <ChangeAccessCodeForm slug={slug} accentColor={accentColor} />
          </div>
        </ProPanel>
      </div>
    </ProShell>
  );
}
