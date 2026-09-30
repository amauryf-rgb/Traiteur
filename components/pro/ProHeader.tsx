import Link from "next/link";
import { initials } from "@/lib/format";
import { logout } from "@/app/[slug]/pro/actions";
import { BRAND_BLACK } from "@/lib/theme";

export type ProNavKey = "planning" | "comptoir" | "catalogue" | "facturation" | "dossier" | "etablissement" | "compte";

const NAV_ITEMS: { key: ProNavKey; href: string; label: string; ownerOnly?: boolean }[] = [
  { key: "planning", href: "", label: "Planning" },
  { key: "comptoir", href: "/comptoir", label: "Comptoir" },
  { key: "catalogue", href: "/catalogue", label: "Catalogue" },
  { key: "facturation", href: "/facturation", label: "Facturation", ownerOnly: true },
  { key: "dossier", href: "/dossier", label: "Dossier", ownerOnly: true },
  // Regroupe équipe, fermetures et identité visuelle (logo/bandeau) sous un
  // seul lien, en onglets — évite d'ajouter un 8e lien à une nav déjà dense.
  { key: "etablissement", href: "/etablissement", label: "Établissement", ownerOnly: true },
  // Volontairement pas ownerOnly : chacun (owner, manager, employé) gère
  // son propre code d'accès depuis là — voir app/[slug]/pro/compte/.
  { key: "compte", href: "/compte", label: "Mon compte" },
];

export function ProHeader({
  slug,
  establishment,
  staffName,
  isOwner,
  active,
}: {
  slug: string;
  establishment: { name: string; accentColor: string | null; logoUrl?: string | null };
  staffName: string;
  isOwner: boolean;
  active: ProNavKey;
}) {
  return (
    <header className="text-white" style={{ backgroundColor: BRAND_BLACK }}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {establishment.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={establishment.logoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-serif text-sm shrink-0">
              {initials(establishment.name)}
            </div>
          )}
          <div>
            <p className="font-serif text-sm leading-tight">{establishment.name}</p>
            <p className="text-xs text-white/70 leading-tight">{staffName}</p>
          </div>
        </div>

        <nav className="flex items-center gap-4 flex-wrap text-xs">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => (
            <Link
              key={item.key}
              href={`/${slug}/pro${item.href}`}
              className={active === item.key ? "font-medium underline underline-offset-2" : "text-white/80 hover:text-white hover:underline underline-offset-2"}
            >
              {item.label}
            </Link>
          ))}
          <form action={logout.bind(null, slug)}>
            <button type="submit" className="text-white/80 hover:text-white underline underline-offset-2">
              Se déconnecter
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
