"use client";

import { useState, type CSSProperties } from "react";
import { formatCHF } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { useCanHover } from "@/lib/useCanHover";
import type { CatalogueProduct } from "@/lib/db/queries";

// Format "menu de restaurant" (voir catalogue-carte-restaurant-reference.html
// pour la structure exacte) : une ligne par produit — nom en serif, ligne
// pointillée jusqu'au prix en serif italique couleur d'accent, description
// courte en italique sans-serif en dessous. Pas de photo visible par défaut.
// - Souris/trackpad (hover: hover + pointer: fine) : survol → photo en
//   tooltip flottant à gauche de la ligne, hors flux, fondu ~150ms,
//   purement visuel. La ligne n'est pas cliquable pour ouvrir quoi que ce
//   soit ; l'ajout au panier reste possible en permanence via le contrôle
//   +/- affiché en bout de ligne, indépendant du survol.
// - Tactile (et tout appareil sans survol précis, même un grand écran) :
//   tap sur la ligne → accordéon avec photo + contrôle d'ajout dédié.
//   Le tap sur la ligne n'ajoute jamais directement au panier — seul le
//   contrôle du panneau déplié le fait (évite les ajouts accidentels).
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
  const accentVars = { "--accent": accentColor } as CSSProperties;

  const addButtonClass =
    "w-7 h-7 rounded-full border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white flex items-center justify-center transition-colors";
  const removeButtonClass =
    "w-7 h-7 rounded-full border-stone-300 text-stone-500 hover:bg-stone-500 hover:text-white flex items-center justify-center transition-colors";

  const rowContent = (
    <>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-serif text-base whitespace-nowrap">{product.name}</span>
        <span className="flex-1 border-b border-dotted border-stone-300 relative -top-1" />
        <span className="font-serif italic text-[15px] whitespace-nowrap" style={{ color: accentColor }}>
          {formatCHF(Number(product.priceAmount))}
        </span>
      </div>
      {product.description && <p className="text-sm italic text-stone-400 mt-1">{product.description}</p>}
      {product.allergens.length > 0 && (
        <p className="text-xs text-stone-400 mt-0.5">Contient {product.allergens.join(", ").toLowerCase()}</p>
      )}
    </>
  );

  return (
    <div className="relative py-3.5 border-b border-stone-100 last:border-b-0" style={accentVars}>
      <div className="flex items-start gap-3">
        <div
          className="flex-1 min-w-0"
          onMouseEnter={canHover ? () => setHovered(true) : undefined}
          onMouseLeave={canHover ? () => setHovered(false) : undefined}
        >
          {canHover ? (
            rowContent
          ) : (
            <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} className="w-full text-left">
              {rowContent}
            </button>
          )}
        </div>

        {canHover && (
          <div className="shrink-0 pt-0.5">
            {quantity === 0 ? (
              <button onClick={() => onUpdateQuantity(1)} className={addButtonClass} aria-label={`Ajouter un ${product.name}`}>
                +
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => onUpdateQuantity(quantity - 1)} className={removeButtonClass} aria-label={`Retirer un ${product.name}`}>
                  −
                </button>
                <span className="w-4 text-center text-sm">{quantity}</span>
                <button onClick={() => onUpdateQuantity(quantity + 1)} className={addButtonClass} aria-label={`Ajouter un ${product.name}`}>
                  +
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {product.photoUrl && canHover && (
        <div
          className="pointer-events-none absolute right-full top-0 mr-4 w-36 h-36 z-20 transition-opacity duration-150 rounded-lg overflow-hidden shadow-lg border border-stone-200 bg-white"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.photoUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {!canHover && isOpen && (
        <div className="mt-3 flex items-center gap-4">
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
              <button onClick={() => onUpdateQuantity(quantity - 1)} className={removeButtonClass}>
                −
              </button>
              <span className="w-5 text-center text-sm">{quantity}</span>
              <button onClick={() => onUpdateQuantity(quantity + 1)} className={addButtonClass}>
                +
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
