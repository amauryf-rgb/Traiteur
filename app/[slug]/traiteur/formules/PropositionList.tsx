"use client";

import { formatCHF } from "@/lib/format";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
import type { CatalogueProduct } from "@/lib/db/queries";

// Niveau 2 du parcours — les formules (products) de la catégorie choisie,
// en cartes cliquables plutôt qu'en lignes à plat : chaque carte ouvre le
// détail préselectionné (niveau 3), elle ne configure rien elle-même.
export function PropositionList({
  products,
  addedProductIds,
  accentColor,
  onSelect,
}: {
  products: CatalogueProduct[];
  addedProductIds: string[];
  accentColor: string;
  onSelect: (productId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 mt-1">
      {products.map((product) => {
        const added = addedProductIds.includes(product.id);
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product.id)}
            className="rounded-lg border px-4 py-3.5 text-left transition-colors hover:border-current"
            style={{ borderColor: added ? accentColor : PAPER_LINE, color: added ? accentColor : undefined }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-[15px]" style={{ color: added ? accentColor : undefined }}>
                {product.name}
                {added && <span className="text-xs italic ml-2">— ajoutée</span>}
              </span>
              <span className="font-serif italic whitespace-nowrap" style={{ color: accentColor }}>
                {formatCHF(Number(product.priceAmount))}
              </span>
            </div>
            {product.description && (
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: INK_MUTED }}>
                {product.description}
              </p>
            )}
          </button>
        );
      })}
      {products.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: INK_MUTED }}>
          Aucune formule dans cette catégorie.
        </p>
      )}
    </div>
  );
}
