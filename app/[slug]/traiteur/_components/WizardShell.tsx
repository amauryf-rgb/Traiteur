import { GRAIN_STYLE, BRAND_BLACK } from "@/lib/theme";
import { Tricolor } from "@/components/Tricolor";
import { ProgressDots } from "./ProgressDots";

// Coquille visuelle du tunnel de commande traiteur — même charte que le
// catalogue (bandeau noir, grain crème, Tricolor) mais sans la nav
// Traiteur/Boutique ni le CTA panier de CatalogueHeader : on est dans un
// parcours séquentiel, pas un catalogue parcourable, donc ni l'un ni l'autre
// n'a de sens ici. Navigation retour/suivant gérée par chaque étape.
export function WizardShell({
  establishment,
  step,
  accentColor,
  children,
}: {
  establishment: { name: string; logoUrl?: string | null };
  step: 1 | 2 | 3 | 4;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-16" style={GRAIN_STYLE}>
      <header className="text-white" style={{ backgroundColor: BRAND_BLACK }}>
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center justify-center">
          {establishment.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={establishment.logoUrl} alt={establishment.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="font-serif text-lg whitespace-nowrap">{establishment.name}</span>
          )}
        </div>
      </header>
      <Tricolor />

      <div className="max-w-xl mx-auto px-6">
        <ProgressDots step={step} accentColor={accentColor} />
        {children}
      </div>
    </div>
  );
}
