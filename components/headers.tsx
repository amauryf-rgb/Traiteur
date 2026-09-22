import { Monogram } from "./Monogram";

type Establishment = { name: string; tagline: string | null; accentColor: string | null; logoUrl?: string | null };

// Logo — personnalisation par établissement, même principe que la couleur
// d'accent : un établissement sans logo configuré reste utilisable, avec un
// rendu neutre (monogramme + nom). Quand un logo existe, le header bascule
// sur un fond sombre (la couleur d'accent, déjà pensée comme sombre dans les
// usages actuels) pour qu'un logo lui-même à fond sombre (comme celui de
// LabTraiteur) s'y intègre sans rectangle visible.
export function IdentityHeader({ establishment, line }: { establishment: Establishment; line?: string }) {
  if (establishment.logoUrl) {
    return (
      <div className="text-center px-6 py-8" style={{ backgroundColor: establishment.accentColor ?? "#1a1a1a" }}>
        {/* Taille réduite sur mobile plutôt qu'un redimensionnement
            proportionnel naïf : un logo large en format paysage ne doit pas
            dominer un header étroit — max-w plafonne aussi sa largeur. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={establishment.logoUrl} alt={establishment.name} className="h-10 sm:h-14 max-w-[60%] mx-auto object-contain" />
        <p className="text-sm text-white/70 mt-3">{line ?? establishment.tagline}</p>
      </div>
    );
  }
  return (
    <div className="text-center px-6 py-8">
      <div className="flex justify-center mb-3">
        <Monogram name={establishment.name} accentColor={establishment.accentColor} />
      </div>
      <p className="text-xl font-serif">{establishment.name}</p>
      <p className="text-sm text-stone-400 mt-1">{line ?? establishment.tagline}</p>
    </div>
  );
}

export function BrandBanner({ establishment }: { establishment: Establishment }) {
  return (
    <div className="text-center px-6 py-6" style={{ backgroundColor: establishment.accentColor ?? "#1a1a1a" }}>
      {establishment.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={establishment.logoUrl} alt={establishment.name} className="h-9 sm:h-12 max-w-[60%] mx-auto object-contain" />
      ) : (
        <>
          <div className="flex justify-center mb-3">
            <Monogram name={establishment.name} accentColor={establishment.accentColor} invert />
          </div>
          <p className="text-white text-xl font-serif">{establishment.name}</p>
        </>
      )}
      {establishment.tagline && <p className="text-white/70 text-sm italic mt-1">{establishment.tagline}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center px-6 py-6 border-b border-stone-200">
      <p className="text-lg font-serif">{title}</p>
      {subtitle && <p className="text-sm text-stone-400 mt-1">{subtitle}</p>}
    </div>
  );
}

// Fond stone-50 + largeur élargie sur desktop (lg:) : même langage
// graphique que ProShell (dashboard pro) et CatalogueClient, pour que les
// écrans simples (accueil, fermeture, connexion, récap...) ne se retrouvent
// plus en petite carte perdue au milieu d'un grand écran. Sur mobile,
// max-w-md dépasse déjà la largeur de l'écran donc rien ne change visuellement.
export function ScreenCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <main className="max-w-md lg:max-w-2xl mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
        {children}
      </main>
    </div>
  );
}
