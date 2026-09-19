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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={establishment.logoUrl} alt={establishment.name} className="h-14 mx-auto object-contain" />
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
        <img src={establishment.logoUrl} alt={establishment.name} className="h-12 mx-auto object-contain" />
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

export function ScreenCard({ children }: { children: React.ReactNode }) {
  return <main className="max-w-md mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">{children}</main>;
}
