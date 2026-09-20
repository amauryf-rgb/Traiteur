"use client";

import { useState } from "react";
import { formatCHF } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { useCanHover } from "@/lib/useCanHover";
import type { CatalogueProduct } from "@/lib/db/queries";

// Format "menu de restaurant" : une ligne par produit (nom, description,
// prix), sans photo ni contrôle de quantité visibles par défaut.
// - Souris/trackpad (hover: hover + pointer: fine) : survol → photo en
//   tooltip flottant à droite de la ligne, hors flux, fondu ~150ms ;
//   aucun ajout au panier depuis le survol, uniquement visuel.
// - Tactile (et tout appareil sans survol précis, même un grand écran) :
//   tap → accordéon sous la ligne avec photo + contrôle d'ajout dédié.
// Le tap/clic sur la ligne n'ajoute jamais directement au panier — seul le
// contrôle du panneau déplié le fait (évite les ajouts accidentels).
export function MenuRow({
  product,
  quantity,
  accentColor,
  isOpen,
  onToggleOpen,
  onUpdateQuantity,
}: {
  product: CatalogueProduct;
  quantity: number;
  accentColor: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onUpdateQuantity: (quantity: number) => void;
}) {
  const canHover = useCanHover();
  const [hovered, setHovered] = useState(false);
  const showTooltip = canHover && hovered && !isOpen;

  return (
    <div className="relative border-b border-stone-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggleOpen}
        onMouseEnter={canHover ? () => setHovered(true) : undefined}
        onMouseLeave={canHover ? () => setHovered(false) : undefined}
        aria-expanded={isOpen}
        className="w-full text-left px-6 py-3 flex items-start justify-between gap-4 transition-colors"
        style={{ backgroundColor: hovered || isOpen ? "#fafaf9" : "transparent" }}
      >
        <span className="min-w-0">
          <span className="font-serif text-base">{product.name}</span>
          {product.description && <span className="block text-sm text-stone-500 mt-0.5">{product.description}</span>}
          {product.allergens.length > 0 && (
            <span className="block text-xs text-stone-400 mt-0.5">Contient {product.allergens.join(", ").toLowerCase()}</span>
          )}
        </span>
        <span className="text-sm font-medium whitespace-nowrap shrink-0">{formatCHF(Number(product.priceAmount))}</span>
      </button>

      {product.photoUrl && canHover && (
        <div
          className="pointer-events-none absolute left-full top-3 ml-3 w-40 z-20 transition-opacity duration-150"
          style={{ opacity: showTooltip ? 1 : 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.photoUrl}
            alt=""
            className="w-full h-32 object-cover rounded-lg shadow-lg border border-stone-200 bg-white"
          />
        </div>
      )}

      {isOpen && (
        <div className="px-6 pb-4 flex items-center gap-4">
          {product.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.photoUrl} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0" />
          ) : (
            <div className="w-20 h-20 shrink-0 bg-stone-100 rounded-lg flex items-center justify-center text-[10px] text-stone-300 uppercase text-center px-1">
              Photo produit
            </div>
          )}

          {quantity === 0 ? (
            <Button accentColor={accentColor} onClick={() => onUpdateQuantity(1)}>
              Ajouter au panier
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdateQuantity(quantity - 1)}
                className="w-8 h-8 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center"
                aria-label={`Retirer un ${product.name}`}
              >
                −
              </button>
              <span className="w-5 text-center text-sm">{quantity}</span>
              <button
                onClick={() => onUpdateQuantity(quantity + 1)}
                className="w-8 h-8 rounded-full border flex items-center justify-center"
                style={{ borderColor: accentColor, color: accentColor }}
                aria-label={`Ajouter un ${product.name}`}
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
