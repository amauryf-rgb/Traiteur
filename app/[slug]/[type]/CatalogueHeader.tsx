import Link from "next/link";
import { logout } from "../compte/actions";
import type { OrderType } from "@/lib/types";

type Establishment = { name: string; accentColor: string | null; logoUrl?: string | null };

// Bandeau plein écran du catalogue client — remplace BrandBanner sur cette
// page précise (structure différente : barre de navigation, pas un bloc
// d'identité centré). Fond couleur d'accent (même mécanisme que partout
// ailleurs), logo si configuré sinon nom en texte — reprend la même
// logique conditionnelle que IdentityHeader/BrandBanner sans reprendre leur
// balisage, pensé pour une barre horizontale plutôt qu'un bloc centré.
export function CatalogueHeader({
  slug,
  orderType,
  establishment,
  clientName,
  ctaLabel,
  ctaDisabled,
  onCtaClick,
}: {
  slug: string;
  orderType: OrderType;
  establishment: Establishment;
  clientName: string | null;
  ctaLabel: string;
  ctaDisabled: boolean;
  onCtaClick: () => void;
}) {
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <header className="text-white" style={{ backgroundColor: accentColor }}>
      <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="shrink-0">
          {establishment.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={establishment.logoUrl} alt={establishment.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="font-serif text-lg whitespace-nowrap">{establishment.name}</span>
          )}
        </div>

        <nav className="flex items-center gap-5 text-xs uppercase tracking-wider flex-wrap justify-center">
          <Link
            href={`/${slug}/traiteur`}
            className={orderType === "traiteur" ? "font-medium underline underline-offset-4" : "text-white/70 hover:text-white"}
          >
            Traiteur
          </Link>
          <Link
            href={`/${slug}/boutique`}
            className={orderType === "boutique" ? "font-medium underline underline-offset-4" : "text-white/70 hover:text-white"}
          >
            Boutique
          </Link>
          {clientName ? (
            <div className="flex items-center gap-2 normal-case tracking-normal">
              <span className="text-white/70">{clientName}</span>
              <form action={logout.bind(null, slug)}>
                <button type="submit" className="underline hover:text-white/80">
                  Se déconnecter
                </button>
              </form>
            </div>
          ) : (
            <Link href={`/${slug}/compte/login`} className="text-white/70 hover:text-white">
              Se connecter
            </Link>
          )}
        </nav>

        <button
          onClick={onCtaClick}
          disabled={ctaDisabled}
          className="shrink-0 rounded-full px-5 py-2 text-xs uppercase tracking-wider font-medium bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {ctaLabel}
        </button>
      </div>
    </header>
  );
}
