"use client";

import { useState, type CSSProperties } from "react";
import { formatCHF } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { DessertCheckbox } from "@/components/catalogue/DessertCheckbox";
import { QuantityStepper } from "@/components/catalogue/QuantityStepper";
import { useCanHover } from "@/lib/useCanHover";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
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
  index,
  quantity,
  initialWithDessert = true,
  defaultQuantity = 1,
  unitLabel,
  accentColor,
  isOpen,
  onToggleOpen,
  onUpdateQuantity,
}: {
  product: CatalogueProduct;
  index: number;
  quantity: number;
  // Choix déjà fait pour cette ligne (lu depuis le panier, voir
  // CatalogueClient#withDessertFor) — sert uniquement de valeur initiale au
  // montage : au-delà, l'état local ci-dessous prend le relais pour un
  // retour visuel immédiat au clic, sans attendre un aller-retour au panier.
  initialWithDessert?: boolean;
  // Valeur posée au premier ajout ("+" depuis 0) — le nombre de personnes
  // pour le traiteur (voir CatalogueClient), 1 partout ailleurs (boutique).
  // Les +/- restent utilisables ensuite pour un ajustement ligne par ligne.
  defaultQuantity?: number;
  // Unité affichée à côté du chiffre du stepper de ligne (ex. "pers.") —
  // pertinent uniquement en traiteur, où la quantité représente le nombre de
  // personnes servies par cette formule ; absent en boutique où la quantité
  // est un simple nombre d'articles.
  unitLabel?: string;
  accentColor: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onUpdateQuantity: (quantity: number, withDessert?: boolean) => void;
}) {
  const canHover = useCanHover();
  const [hovered, setHovered] = useState(false);
  const accentVars = { "--accent": accentColor } as CSSProperties;

  // Coché par défaut : priceAmount est déjà le prix "avec dessert" affiché en
  // tête de ligne. Absent pour l'immense majorité des produits
  // (priceAmountNoDessert est alors null, la case ne s'affiche jamais).
  const hasDessertOption = product.priceAmountNoDessert != null;
  const [withDessert, setWithDessert] = useState(initialWithDessert);
  // Rattrape le cas où le tout premier rendu (avant que useSyncExternalStore
  // n'ait eu le temps de lire le vrai panier depuis localStorage) a figé
  // useState sur la valeur de repli — sans ça la case restait bloquée sur
  // "avec dessert" après un rechargement, même quand le panier contenait
  // bien le choix "sans dessert". Pattern React officiel ("Adjusting state
  // when a prop changes") plutôt qu'un effet, pour rester synchrone au rendu.
  const [syncedInitial, setSyncedInitial] = useState(initialWithDessert);
  if (initialWithDessert !== syncedInitial) {
    setSyncedInitial(initialWithDessert);
    setWithDessert(initialWithDessert);
  }
  const displayedPrice = hasDessertOption && !withDessert ? Number(product.priceAmountNoDessert) : Number(product.priceAmount);

  function updateQuantity(nextQuantity: number, nextWithDessert = withDessert) {
    onUpdateQuantity(Math.max(0, nextQuantity), hasDessertOption ? nextWithDessert : undefined);
  }

  function toggleWithDessert(checked: boolean) {
    setWithDessert(checked);
    // Répercute immédiatement sur le prix de la ligne déjà présente au
    // panier — pas besoin d'attendre un nouveau clic sur +/-.
    if (quantity > 0) updateQuantity(quantity, checked);
  }

  const dessertCheckbox = hasDessertOption && (
    <DessertCheckbox checked={withDessert} onChange={toggleWithDessert} accentColor={accentColor} />
  );

  // Stepper de ligne — affiché uniquement une fois la formule ajoutée (voir
  // addButton ci-dessous pour l'état "pas encore ajoutée").
  const lineStepper = (
    <QuantityStepper value={quantity} onChange={updateQuantity} unitLabel={unitLabel} accentColor={accentColor} ariaLabel={product.name} />
  );

  // Bouton pilule "Ajouter" — remplace intégralement la case dessert et le
  // stepper tant que la formule n'est pas dans le panier (quantity === 0),
  // pour ne pas afficher ces contrôles sur chaque ligne dès l'arrivée sur la
  // page. Un clic ajoute avec `defaultQuantity` (nombre de personnes global
  // en traiteur), ajustable ensuite librement via le stepper révélé.
  const addButton = (
    <button
      type="button"
      onClick={() => updateQuantity(defaultQuantity)}
      className="inline-flex items-center gap-1.5 mt-2 rounded-full border px-3.5 py-1.5 font-serif italic text-[13px] transition-colors"
      style={{ borderColor: accentColor, color: accentColor }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Ajouter
    </button>
  );

  // Lien "Retirer" — annule l'ajout et revient à l'état "pas encore ajoutée"
  // (quantity 0 retire aussi la ligne du panier, voir lib/cart.ts#setQuantity).
  const removeLink = (
    <button
      type="button"
      onClick={() => updateQuantity(0)}
      className="mt-1.5 text-[11px] underline underline-offset-2"
      style={{ color: INK_MUTED }}
    >
      Retirer
    </button>
  );

  const rowContent = (
    <>
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
    </>
  );

  return (
    <div className="relative py-3.5 border-b last:border-b-0" style={{ ...accentVars, borderColor: PAPER_LINE }}>
      <div className="flex items-start gap-3">
        <span
          className="font-serif italic text-[13px] pt-0.5 w-[22px] shrink-0 opacity-70"
          style={{ color: accentColor }}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div
          className="flex-1 min-w-0"
          onMouseEnter={canHover ? () => setHovered(true) : undefined}
          onMouseLeave={canHover ? () => setHovered(false) : undefined}
        >
          {canHover ? (
            <>
              {rowContent}
              {quantity === 0 ? (
                addButton
              ) : (
                <>
                  <div className={`flex items-center mt-2 ${hasDessertOption ? "justify-between" : "justify-end"}`}>
                    {dessertCheckbox}
                    {lineStepper}
                  </div>
                  {removeLink}
                </>
              )}
            </>
          ) : (
            <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} className="w-full text-left">
              {rowContent}
            </button>
          )}
        </div>
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
        <div className="mt-3">
          <div className="flex items-center gap-4">
            {product.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.photoUrl} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0" />
            ) : (
              <div className="w-20 h-20 shrink-0 bg-stone-100 rounded-lg flex items-center justify-center text-[10px] text-stone-300 uppercase text-center px-1">
                Photo produit
              </div>
            )}

            {quantity === 0 ? (
              <Button accentColor={accentColor} onClick={() => updateQuantity(defaultQuantity)}>
                Ajouter au panier
              </Button>
            ) : (
              <QuantityStepper value={quantity} onChange={updateQuantity} accentColor={accentColor} ariaLabel={product.name} size="touch" />
            )}
          </div>
          {quantity > 0 && (
            <div className={`mt-2.5 flex items-center ${hasDessertOption ? "justify-between" : "justify-end"}`}>
              {dessertCheckbox}
              {removeLink}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
