"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWizardEvent, useWizardFormulas } from "@/lib/traiteurWizard";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
import { FormulaRow } from "./FormulaRow";
import type { CatalogueProduct } from "@/lib/db/queries";

export function FormulesForm({ slug, products, accentColor }: { slug: string; products: CatalogueProduct[]; accentColor: string }) {
  const router = useRouter();
  const { event } = useWizardEvent(slug);
  const { formulas, addFormula, updateFormula, removeFormula, totalAllocated } = useWizardFormulas(slug);
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [touched, setTouched] = useState(false);

  const categories = useMemo(() => {
    const orderByName = new Map<string, number>();
    for (const p of products) {
      if (p.categoryName && !orderByName.has(p.categoryName)) orderByName.set(p.categoryName, p.categorySortOrder ?? 0);
    }
    return ["Tout", ...Array.from(orderByName.entries()).sort((a, b) => a[1] - b[1]).map(([name]) => name)];
  }, [products]);

  const visibleProducts = activeCategory === "Tout" ? products : products.filter((p) => p.categoryName === activeCategory);

  // Quantité proposée par défaut à l'ajout : le solde de convives pas encore
  // réparti sur une autre formule — même logique que l'ancien catalogue
  // (CatalogueClient#remainingGuests), pour ne pas proposer par exemple 25
  // alors que 25 sont déjà affectés à une première formule.
  const remainingGuests = Math.max(1, event.guestCount - totalAllocated);

  function lineFor(productId: string) {
    return formulas.find((f) => f.productId === productId);
  }

  function handleContinue() {
    setTouched(true);
    if (formulas.length === 0) return;
    router.push(`/${slug}/traiteur/coordonnees`);
  }

  return (
    <div className="pb-4">
      <div className="flex flex-wrap justify-center gap-6 py-4" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className="pb-1.5 whitespace-nowrap relative text-xs uppercase tracking-wider"
            style={
              activeCategory === category
                ? { borderBottom: `2px solid ${accentColor}`, color: accentColor, fontWeight: 500 }
                : { color: INK_MUTED }
            }
          >
            {category}
          </button>
        ))}
      </div>

      <div className="py-2">
        {visibleProducts.map((product, i) => (
          <FormulaRow
            key={product.id}
            product={product}
            index={i + 1}
            line={lineFor(product.id)}
            accentColor={accentColor}
            onAdd={() => addFormula(product, remainingGuests)}
            onUpdate={(patch) => updateFormula(product.id, patch)}
            onRemove={() => removeFormula(product.id)}
          />
        ))}
        {visibleProducts.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: INK_MUTED }}>
            Aucune formule dans cette catégorie.
          </p>
        )}
      </div>

      {touched && formulas.length === 0 && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">Choisissez au moins une formule avant de continuer.</p>
      )}

      <div className="flex items-center justify-between pt-6">
        <Link href={`/${slug}/traiteur/evenement`} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
          ← Retour
        </Link>
        <button
          type="button"
          onClick={handleContinue}
          className="font-serif italic rounded-full px-6 py-2.5 text-[13px] transition-colors"
          style={{ backgroundColor: accentColor, color: "white" }}
        >
          Continuer →
        </button>
      </div>
    </div>
  );
}
