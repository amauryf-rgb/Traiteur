"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWizardEvent, useWizardFormulas, isEventStepComplete } from "@/lib/traiteurWizard";
import { useHydrated } from "@/lib/localStore";
import { INK_MUTED } from "@/lib/theme";
import { CategoryList } from "./CategoryList";
import { PropositionList } from "./PropositionList";
import { FormulaDetail } from "./FormulaDetail";
import { AddedFormulasSummary } from "./AddedFormulasSummary";
import type { CatalogueProduct } from "@/lib/db/queries";

const UNCATEGORIZED_LABEL = "Autres";

function categoryLabelFor(product: CatalogueProduct): string {
  return product.categoryName ?? UNCATEGORIZED_LABEL;
}

type Screen = { level: 1 } | { level: 2; category: string } | { level: 3; category: string; productId: string };

export function FormulesForm({ slug, products, accentColor }: { slug: string; products: CatalogueProduct[]; accentColor: string }) {
  const router = useRouter();
  const { event } = useWizardEvent(slug);
  const { formulas, addFormula, updateFormula, removeFormula, totalAllocated } = useWizardFormulas(slug);
  const [screen, setScreen] = useState<Screen>({ level: 1 });
  const [touched, setTouched] = useState(false);

  // Accès direct à cette URL sans être passé par l'étape 1 (brouillon
  // événement vide ou incomplet) — redirige plutôt que de laisser avancer
  // avec un nombre de convives par défaut non voulu. On attend l'hydratation
  // avant de juger "incomplet" : juste après un rechargement complet,
  // useWizardEvent rend encore sa valeur de repli vide le temps que
  // useSyncExternalStore se resynchronise sur le vrai localStorage — agir
  // sur ce rendu transitoire renverrait à tort vers l'étape 1 même avec un
  // brouillon complet.
  const hydrated = useHydrated();
  const eventIncomplete = !isEventStepComplete(event);
  useEffect(() => {
    if (hydrated && eventIncomplete) router.replace(`/${slug}/traiteur/evenement`);
  }, [hydrated, eventIncomplete, router, slug]);

  const categories = useMemo(() => {
    const byName = new Map<string, number>();
    for (const p of products) {
      const name = categoryLabelFor(p);
      if (!byName.has(name)) byName.set(name, p.categoryName ? (p.categorySortOrder ?? 0) : Number.MAX_SAFE_INTEGER);
    }
    return Array.from(byName.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }, [products]);

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

  function handleEditFromSummary(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setScreen({ level: 3, category: categoryLabelFor(product), productId });
  }

  if (eventIncomplete) return null;

  if (screen.level === 2) {
    const visibleProducts = products.filter((p) => categoryLabelFor(p) === screen.category);
    return (
      <div className="pb-4">
        <p className="text-xs mb-3" style={{ color: INK_MUTED }}>
          <button type="button" onClick={() => setScreen({ level: 1 })} className="underline underline-offset-2">
            Formules
          </button>{" "}
          / {screen.category}
        </p>
        <PropositionList
          products={visibleProducts}
          addedProductIds={formulas.map((f) => f.productId)}
          accentColor={accentColor}
          onSelect={(productId) => setScreen({ level: 3, category: screen.category, productId })}
        />
        <div className="pt-6">
          <button type="button" onClick={() => setScreen({ level: 1 })} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  if (screen.level === 3) {
    const product = products.find((p) => p.id === screen.productId);
    if (!product) return null;
    return (
      <FormulaDetail
        product={product}
        categoryLabel={screen.category}
        line={lineFor(product.id)}
        accentColor={accentColor}
        onBack={() => setScreen({ level: 2, category: screen.category })}
        onSave={(draft) => {
          if (lineFor(product.id)) {
            updateFormula(product.id, draft);
          } else {
            addFormula(product, remainingGuests);
            updateFormula(product.id, draft);
          }
          setScreen({ level: 1 });
        }}
      />
    );
  }

  return (
    <div className="pb-4">
      <CategoryList categories={categories} accentColor={accentColor} onSelect={(category) => setScreen({ level: 2, category })} />

      <div className="mt-6">
        <p className="text-[10.5px] uppercase tracking-wide mb-2" style={{ color: INK_MUTED }}>
          Formules ajoutées
        </p>
        <AddedFormulasSummary
          formulas={formulas}
          products={products}
          accentColor={accentColor}
          onUpdateQuantity={(productId, quantity) => updateFormula(productId, { quantity })}
          onUpdateDessert={(productId, withDessert) => updateFormula(productId, { withDessert })}
          onEdit={handleEditFromSummary}
          onRemove={removeFormula}
        />
      </div>

      {touched && formulas.length === 0 && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-4">Choisissez au moins une formule avant de continuer.</p>
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
