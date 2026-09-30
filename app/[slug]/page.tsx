import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { getClientTenantContext } from "@/lib/tenant";
import { HeroBand } from "./HeroBand";
import { Tricolor } from "@/components/Tricolor";
import { GRAIN_STYLE, INK, INK_MUTED, PAPER_LINE, accentTint } from "@/lib/theme";
import { logout } from "./compte/actions";

// Icônes fines en SVG (trait, pas de fond plein) — mêmes tracés que la
// démo : un sac pour la boutique, une caisse pour le traiteur.
const UNIVERSES = [
  {
    type: "boutique" as const,
    title: "Boutique du jour",
    description: "Plats et produits disponibles aujourd'hui, à retirer dans l'heure. Paiement immédiat.",
    icon: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  {
    type: "traiteur" as const,
    title: "Commande traiteur",
    description: "Pour un événement ou une réception, à commander à l'avance. Acompte à la commande, solde au retrait.",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9.5h16" />
        <path d="M8 3v3M16 3v3" />
      </>
    ),
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
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  const corner = clientTenant ? (
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
  );

  return (
    <div className="min-h-screen" style={GRAIN_STYLE}>
      <HeroBand name={establishment.name} line="Que souhaitez-vous faire ?" bannerUrl={establishment.bannerUrl} corner={corner} />
      <Tricolor />
      <div className="max-w-2xl mx-auto">
        <div className="px-[18px] py-[18px] flex flex-col gap-3">
          {UNIVERSES.map((universe) => (
            <Link
              key={universe.type}
              href={`/${slug}/${universe.type}`}
              className="flex items-center gap-3.5 rounded-b-lg px-4 py-4 transition-colors hover:bg-black/[0.02]"
              style={{ border: `1px solid ${PAPER_LINE}`, borderTop: `2px solid ${accentColor}` }}
            >
              <span
                className="flex items-center justify-center w-[38px] h-[38px] rounded-full shrink-0"
                style={{ backgroundColor: accentTint(accentColor) }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {universe.icon}
                </svg>
              </span>
              <div className="flex-1">
                <p className="font-serif text-[17px]" style={{ color: INK }}>
                  {universe.title}
                </p>
                <p className="text-[12.5px] leading-snug mt-0.5" style={{ color: INK_MUTED }}>
                  {universe.description}
                </p>
              </div>
              <span className="font-serif italic text-base" style={{ color: accentColor }}>
                →
              </span>
            </Link>
          ))}
        </div>
        <p className="font-serif italic text-center text-[11.5px] px-[18px] pb-[18px]" style={{ color: INK_MUTED }}>
          Pas besoin de compte pour commander
        </p>
      </div>
    </div>
  );
}
