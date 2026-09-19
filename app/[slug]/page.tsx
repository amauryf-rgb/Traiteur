import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { getClientTenantContext } from "@/lib/tenant";
import { IdentityHeader, ScreenCard } from "@/components/headers";
import { logout } from "./compte/actions";

const UNIVERSES = [
  {
    type: "boutique" as const,
    title: "Boutique du jour",
    description: "Plats et produits disponibles aujourd'hui, à retirer dans l'heure. Paiement immédiat.",
  },
  {
    type: "traiteur" as const,
    title: "Commande traiteur",
    description: "Pour un événement ou une réception, à commander à l'avance. Acompte à la commande, solde au retrait.",
  },
];

export default async function EstablishmentEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  // Contrairement au tunnel de commande, ce compte n'est jamais requis ici :
  // uniquement affiché s'il existe déjà une session valide pour CET
  // établissement précis (getClientTenantContext vérifie la correspondance,
  // pas juste la présence d'un cookie).
  const clientTenant = await getClientTenantContext(slug);

  // Le header bascule sur fond sombre quand un logo est configuré (voir
  // IdentityHeader) — les contrôles superposés dans le coin doivent suivre,
  // sinon un texte stone-400 devient illisible sur fond sombre.
  const cornerTextClass = establishment.logoUrl ? "text-white/70 hover:text-white" : "text-stone-400 hover:text-stone-600";

  return (
    <ScreenCard>
      <div className="relative">
        <div className={`absolute top-4 right-5 text-xs ${cornerTextClass}`}>
          {clientTenant ? (
            <div className="flex items-center gap-2">
              <span>{clientTenant.session.name}</span>
              <form action={logout.bind(null, slug)}>
                <button type="submit" className="underline">
                  Se déconnecter
                </button>
              </form>
            </div>
          ) : (
            <Link href={`/${slug}/compte/login`} className="flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Se connecter
            </Link>
          )}
        </div>
        <IdentityHeader establishment={establishment} line="Que souhaitez-vous faire ?" />
      </div>

      <div className="px-6 pb-2 flex flex-col gap-4 border-t border-stone-200 pt-6">
        {UNIVERSES.map((universe) => (
          <Link
            key={universe.type}
            href={`/${slug}/${universe.type}`}
            className="block rounded-xl border border-stone-200 px-5 py-4 hover:border-stone-300 transition-colors"
          >
            <div className="flex justify-between items-baseline gap-3">
              <p className="font-serif text-base">{universe.title}</p>
              <span className="text-stone-400">→</span>
            </div>
            <p className="text-sm text-stone-500 mt-1">{universe.description}</p>
          </Link>
        ))}
      </div>
      <p className="px-6 pb-6 text-center text-xs text-stone-400">Pas besoin de compte pour commander</p>
    </ScreenCard>
  );
}
