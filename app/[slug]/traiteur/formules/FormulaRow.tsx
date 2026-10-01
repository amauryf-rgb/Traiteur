"use client";

import { formatCHF } from "@/lib/format";
import { DessertCheckbox } from "@/components/catalogue/DessertCheckbox";
import { QuantityStepper } from "@/components/catalogue/QuantityStepper";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { WizardFormulaLine } from "@/lib/traiteurWizard";

// Une ligne de formule dans l'étape 2 du tunnel — même langage visuel que
// MenuRow (numérotation italique, filet pointillé, bouton "Ajouter" en
// pilule puis stepper révélé) mais sans le mode hover/accordéon de
// l'ancien catalogue : ici le client avance dans un parcours guidé, pas un
// catalogue à parcourir, un seul agencement suffit sur tous les écrans.
export function FormulaRow({
  product,
  index,
  line,
  accentColor,
  onAdd,
  onUpdate,
  onRemove,
}: {
  product: CatalogueProduct;
  index: number;
  line: WizardFormulaLine | undefined;
  accentColor: string;
  onAdd: () => void;
  onUpdate: (patch: Partial<WizardFormulaLine>) => void;
  onRemove: () => void;
}) {
  const hasDessertOption = product.priceAmountNoDessert != null;
  const withDessert = line?.withDessert ?? true;
  const displayedPrice = hasDessertOption && !withDessert ? Number(product.priceAmountNoDessert) : Number(product.priceAmount);

  return (
    <div className="relative py-3.5 border-b last:border-b-0" style={{ borderColor: PAPER_LINE, "--accent": accentColor } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <span className="font-serif italic text-[13px] pt-0.5 w-[22px] shrink-0 opacity-70" style={{ color: accentColor }}>
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-serif text-base whitespace-nowrap">{product.name}</span>
            <span className="flex-1 border-b border-dotted relative -top-1" style={{ borderColor: PAPER_LINE }} />
            <span className="font-serif italic text-[15px] whitespace-nowrap" style={{ color: accentColor }}>
              {formatCHF(displayedPrice)}
            </span>
          </div>
          {product.description && (
            <p className="text-sm italic mt-1 whitespace-pre-line" style={{ color: INK_MUTED }}>
              {product.description}
            </p>
          )}
          {product.allergens.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: INK_MUTED }}>
              Contient {product.allergens.join(", ").toLowerCase()}
            </p>
          )}

          {!line ? (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 mt-2 rounded-full border px-3.5 py-1.5 font-serif italic text-[13px] transition-colors"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Ajouter
            </button>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2.5">
              <div className={`flex items-center ${hasDessertOption ? "justify-between" : "justify-end"}`}>
                {hasDessertOption && (
                  <DessertCheckbox
                    checked={withDessert}
                    onChange={(checked) => onUpdate({ withDessert: checked })}
                    accentColor={accentColor}
                  />
                )}
                <QuantityStepper
                  value={line.quantity}
                  onChange={(q) => (q === 0 ? onRemove() : onUpdate({ quantity: q }))}
                  unitLabel="pers."
                  accentColor={accentColor}
                  ariaLabel={product.name}
                />
              </div>

              {product.components.map((component) => (
                <label key={component.id} className="flex items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wide shrink-0" style={{ color: INK_MUTED }}>
                    {component.label}
                  </span>
                  <select
                    value={line.selections[component.id] ?? ""}
                    onChange={(e) => onUpdate({ selections: { ...line.selections, [component.id]: e.target.value } })}
                    className="flex-1 font-serif italic text-sm outline-none bg-transparent border-b"
                    style={{ borderColor: PAPER_LINE, color: accentColor }}
                  >
                    {component.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <textarea
                value={line.customerNote}
                onChange={(e) => onUpdate({ customerNote: e.target.value })}
                placeholder="Demande particulière (allergie, ajustement non prévu…)"
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-xs outline-none resize-none"
                style={{ borderColor: PAPER_LINE, color: INK_MUTED }}
              />

              <button type="button" onClick={onRemove} className="self-start text-[11px] underline underline-offset-2" style={{ color: INK_MUTED }}>
                Retirer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
