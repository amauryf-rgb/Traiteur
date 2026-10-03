"use client";

import { useState } from "react";
import { formatCHF } from "@/lib/format";
import { ChecklistCheckbox } from "@/components/catalogue/ChecklistCheckbox";
import { DessertCheckbox } from "@/components/catalogue/DessertCheckbox";
import { INK_MUTED, PAPER_LINE, accentTint } from "@/lib/theme";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { WizardFormulaLine } from "@/lib/traiteurWizard";

type Draft = Pick<WizardFormulaLine, "withDessert" | "selections" | "excludedComponentIds" | "customerNote">;

function defaultDraft(product: CatalogueProduct): Draft {
  const selections: Record<string, string> = {};
  for (const component of product.components) {
    if (component.type !== "choice") continue;
    const defaultOption = component.options.find((o) => o.isDefault) ?? component.options[0];
    if (defaultOption) selections[component.id] = defaultOption.id;
  }
  return {
    withDessert: product.priceAmountNoDessert != null ? true : undefined,
    selections,
    excludedComponentIds: [],
    customerNote: "",
  };
}

// Niveau 3 du parcours — le détail complet d'une proposition, tout
// présélectionné : les components 'include' sont cochés par défaut
// (décochables), les components 'choice' affichent leur sélecteur habituel,
// le dessert réutilise DessertCheckbox tel quel. Aucune quantité ici — le
// stepper par formule reste au niveau 1, une fois la formule ajoutée (voir
// lib/traiteurWizard.ts).
export function FormulaDetail({
  product,
  categoryLabel,
  line,
  accentColor,
  onSave,
  onBack,
}: {
  product: CatalogueProduct;
  categoryLabel: string;
  line: WizardFormulaLine | undefined;
  accentColor: string;
  onSave: (draft: Draft) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    line
      ? { withDessert: line.withDessert, selections: line.selections, excludedComponentIds: line.excludedComponentIds, customerNote: line.customerNote }
      : defaultDraft(product)
  );

  const hasDessertOption = product.priceAmountNoDessert != null;
  const withDessert = draft.withDessert ?? true;
  const displayedPrice = hasDessertOption && !withDessert ? Number(product.priceAmountNoDessert) : Number(product.priceAmount);

  function toggleExclusion(componentId: string, included: boolean) {
    setDraft((prev) => ({
      ...prev,
      excludedComponentIds: included ? prev.excludedComponentIds.filter((id) => id !== componentId) : [...prev.excludedComponentIds, componentId],
    }));
  }

  return (
    <div className="pt-1">
      <p className="text-xs mb-3" style={{ color: INK_MUTED }}>
        {categoryLabel} / {product.name}
      </p>

      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-serif text-lg">{product.name}</span>
        <span className="font-serif italic text-[15px]" style={{ color: accentColor }}>
          {formatCHF(displayedPrice)}
        </span>
      </div>
      <p className="text-xs mb-3.5 leading-relaxed" style={{ color: INK_MUTED }}>
        Tout est présélectionné. Décochez ce que vous ne souhaitez pas — vos choix seront repris tels quels sur le devis.
      </p>

      <div>
        {product.components.map((component) =>
          component.type === "header" ? (
            <p
              key={component.id}
              className="text-[10.5px] uppercase tracking-wide font-medium mt-4 mb-1 first:mt-0"
              style={{ color: accentColor }}
            >
              {component.label}
            </p>
          ) : component.type === "include" ? (
            <ChecklistCheckbox
              key={component.id}
              label={component.label}
              checked={!draft.excludedComponentIds.includes(component.id)}
              onChange={(checked) => toggleExclusion(component.id, checked)}
              accentColor={accentColor}
            />
          ) : (
            <div key={component.id} className="py-2.5 border-b border-dotted" style={{ borderColor: PAPER_LINE }}>
              <div className="text-[10.5px] uppercase tracking-wide mb-1" style={{ color: INK_MUTED }}>
                {component.label}
              </div>
              <select
                value={draft.selections[component.id] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, selections: { ...prev.selections, [component.id]: e.target.value } }))}
                className="w-full font-serif italic text-sm outline-none bg-transparent border-b py-0.5"
                style={{ borderColor: PAPER_LINE, color: accentColor }}
              >
                {component.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
        {hasDessertOption && (
          <>
            <p className="text-[10.5px] uppercase tracking-wide font-medium mt-4 mb-1" style={{ color: accentColor }}>
              Dessert (en option)
            </p>
            <div className="py-2.5 border-b border-dotted" style={{ borderColor: PAPER_LINE }}>
              <DessertCheckbox
                checked={withDessert}
                onChange={(checked) => setDraft((prev) => ({ ...prev, withDessert: checked }))}
                accentColor={accentColor}
                label={product.dessertDescription ?? undefined}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-lg border p-3.5" style={{ borderColor: PAPER_LINE, backgroundColor: accentTint(accentColor) }}>
        <p className="text-[10.5px] uppercase tracking-wide font-medium mb-1.5" style={{ color: accentColor }}>
          Demande particulière
        </p>
        <textarea
          value={draft.customerNote}
          onChange={(e) => setDraft((prev) => ({ ...prev, customerNote: e.target.value }))}
          placeholder="Allergie, remplacement non prévu, ajouter un plat, quantité particulière…"
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-xs outline-none resize-none bg-white"
          style={{ borderColor: PAPER_LINE, color: INK_MUTED }}
        />
        <p className="text-[10.5px] mt-1.5 leading-relaxed opacity-85" style={{ color: INK_MUTED }}>
          L&apos;établissement ajuste manuellement le devis selon ce que vous indiquez ici.
        </p>
      </div>

      <div className="flex items-center justify-between pt-6">
        <button type="button" onClick={onBack} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
          ← Retour
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="font-serif italic rounded-full px-6 py-2.5 text-[13px] transition-colors"
          style={{ backgroundColor: accentColor, color: "white" }}
        >
          {line ? "Mettre à jour cette formule →" : "Ajouter cette formule au devis →"}
        </button>
      </div>
    </div>
  );
}
