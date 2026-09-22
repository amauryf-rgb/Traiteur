import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePlatformAdminContext, runAsTenant } from "@/lib/tenant";
import { getPlatformEstablishmentSummaries } from "@/lib/db/queries";
import { formatCHF } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProPanel } from "@/components/pro/ProShell";
import { AddPartnerForm } from "./AddPartnerForm";
import { logoutPlatformAdmin } from "./actions";

// Voir app/admin/setup/page.tsx : pas de segment dynamique ici non plus.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  payment_pending: { label: "Paiement en attente", tone: "warning" },
  active: { label: "Actif", tone: "success" },
  suspended: { label: "Suspendu", tone: "warning" },
};

// Route entièrement séparée de app/[slug]/** : session platform_admin
// dédiée (lib/auth.ts), jamais dérivée d'une session staff même owner. Les
// requêtes ci-dessous passent sous isPlatformAdmin=true, seul cas où RLS
// laisse voir plusieurs établissements à la fois (schema.sql, section 12).
export default async function AdminDashboardPage() {
  const platformAdmin = await requirePlatformAdminContext();
  if (!platformAdmin) redirect("/admin/login");

  const establishmentSummaries = await runAsTenant(platformAdmin.context, (tx) => getPlatformEstablishmentSummaries(tx));

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-400">Console plateforme</p>
            <p className="text-sm font-medium">{platformAdmin.session.name}</p>
          </div>
          <form action={logoutPlatformAdmin}>
            <button type="submit" className="text-xs text-stone-400 hover:text-stone-600 underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">
        <ProPanel>
          <p className="px-6 py-3 text-xs text-stone-400 border-b border-stone-200">Ajouter un partenaire</p>
          <AddPartnerForm />
        </ProPanel>

        <ProPanel>
          <p className="px-6 py-3 text-xs text-stone-400 border-b border-stone-200">
            Établissements ({establishmentSummaries.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
                  <th className="px-6 py-2 font-normal">Établissement</th>
                  <th className="px-4 py-2 font-normal">Statut</th>
                  <th className="px-4 py-2 font-normal text-right">Chiffre d&apos;affaires</th>
                  <th className="px-4 py-2 font-normal text-right">Commandes</th>
                  <th className="px-4 py-2 font-normal text-right">Clients</th>
                  <th className="px-4 py-2 font-normal">Owners</th>
                  <th className="px-6 py-2 font-normal">Espace pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {establishmentSummaries.map((establishment) => {
                  const status = STATUS_BADGE[establishment.onboardingStatus] ?? { label: establishment.onboardingStatus, tone: "neutral" as const };
                  return (
                    <tr key={establishment.id}>
                      <td className="px-6 py-3 font-medium whitespace-nowrap">{establishment.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatCHF(Number(establishment.revenue))}</td>
                      <td className="px-4 py-3 text-right">{establishment.orderCount}</td>
                      <td className="px-4 py-3 text-right">{establishment.clientCount}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">
                        {establishment.owners.length === 0 ? (
                          "—"
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {establishment.owners.map((owner, i) => (
                              <span key={i} className="whitespace-nowrap">
                                {owner.name} · <span className="font-mono">{owner.accessCode ?? "—"}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <Link href={`/${establishment.slug}/pro/login`} className="text-xs underline text-stone-500 hover:text-stone-700">
                          /{establishment.slug}/pro
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {establishmentSummaries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-stone-400 text-sm">
                      Aucun établissement pour l&apos;instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ProPanel>
      </main>
    </div>
  );
}
