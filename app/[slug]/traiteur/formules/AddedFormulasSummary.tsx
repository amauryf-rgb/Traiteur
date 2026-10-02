"use client";

import { DessertCheckbox } from "@/components/catalogue/DessertCheckbox";
import { QuantityStepper } from "@/components/catalogue/QuantityStepper";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { WizardFormulaLine } from "@/lib/traiteurWizard";

// Résumé des formules déjà ajoutées, affiché au niveau 1 du parcours — le
// stepper de quantité et le choix avec/sans dessert restent éditables
// directement ici (comme sur l'ancien FormulaRow), le détail complet
// (sélections, exclusions, demande particulière) se modifie via "Modifier",
// qui rouvre le niveau 3 pré-rempli avec l'état déjà enregistré.
export function AddedFormulasSummary({
  formulas,
  products,
  accentColor,
  onUpdateQuantity,
  onUpdateDessert,
  onEdit,
  onRemove,
}: {
  formulas: WizardFormulaLine[];
  products: CatalogueProduct[];
  accentColor: string;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onUpdateDessert: (productId: string, withDessert: boolean) => void;
  onEdit: (productId: string) => void;
  onRemove: (productId: string) => void;
}) {
  if (formulas.length === 0) {
    return <p className="text-xs italic" style={{ color: INK_MUTED }}>Aucune formule ajoutée pour l&apos;instant.</p>;
  }

  return (
    <div className="flex flex-col" style={{ "--accent": accentColor } as React.CSSProperties}>
      {formulas.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return null;
        const hasDessertOption = product.priceAmountNoDessert != null;
        return (
          <div key={line.productId} className="py-3 border-b" style={{ borderColor: PAPER_LINE }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-serif text-[15px]">{product.name}</p>
                {product.categoryName && (
                  <p className="text-[10.5px] uppercase tracking-wide mt-0.5" style={{ color: INK_MUTED }}>
                    {product.categoryName}
                  </p>
                )}
              </div>
              <QuantityStepper
                value={line.quantity}
                onChange={(q) => (q === 0 ? onRemove(product.id) : onUpdateQuantity(product.id, q))}
                unitLabel="pers."
                accentColor={accentColor}
                ariaLabel={product.name}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              {hasDessertOption ? (
                <DessertCheckbox checked={line.withDessert ?? true} onChange={(checked) => onUpdateDessert(product.id, checked)} accentColor={accentColor} />
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => onEdit(product.id)} className="text-[11px] underline underline-offset-2" style={{ color: accentColor }}>
                  Modifier
                </button>
                <button type="button" onClick={() => onRemove(product.id)} className="text-[11px] underline underline-offset-2" style={{ color: INK_MUTED }}>
                  Retirer
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
