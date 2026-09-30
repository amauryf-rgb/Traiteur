"use client";

import { useState, type CSSProperties } from "react";
import { formatCHF } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { useCanHover } from "@/lib/useCanHover";
import { INK_MUTED, PAPER, PAPER_LINE } from "@/lib/theme";
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

  // Saisie directe du chiffre de quantité (en plus des boutons -/+), même
  // principe que le nombre de personnes global (CatalogueClient) : état local
  // pour permettre de vider le champ le temps de taper une nouvelle valeur,
  // resynchronisé avec `quantity` (source de vérité, panier) via le pattern
  // React "Adjusting state when a prop changes" plutôt qu'un effet.
  const [qtyInput, setQtyInput] = useState(String(quantity));
  const [syncedQuantity, setSyncedQuantity] = useState(quantity);
  if (quantity !== syncedQuantity) {
    setSyncedQuantity(quantity);
    setQtyInput(String(quantity));
  }

  function commitQtyInput() {
    const parsed = parseInt(qtyInput, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateQuantity(parsed);
    } else {
      setQtyInput(String(quantity));
    }
  }

  function toggleWithDessert(checked: boolean) {
    setWithDessert(checked);
    // Répercute immédiatement sur le prix de la ligne déjà présente au
    // panier — pas besoin d'attendre un nouveau clic sur +/-.
    if (quantity > 0) updateQuantity(quantity, checked);
  }

  const addButtonClass =
    "w-7 h-7 rounded-full border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white flex items-center justify-center transition-colors";
  const removeButtonClass =
    "w-7 h-7 rounded-full border border-stone-300 text-stone-500 hover:bg-stone-500 hover:text-white flex items-center justify-center transition-colors";

  // Stepper de ligne, gabarit réduit (~22px) et neutre au repos — distinct des
  // classes ci-dessus (accordéon mobile, tactile, gardées à leur taille
  // actuelle) pour ne pas rétrécir des cibles tactiles. #d9d5c9/#6b5d55
  // reprennent PAPER_LINE/INK_MUTED en dur (plutôt qu'un style inline) pour
  // que hover: puisse les remplacer par l'accent — un style inline aurait
  // priorité sur la pseudo-classe et empêcherait le survol de fonctionner.
  const lineStepperButtonClass =
    "w-[22px] h-[22px] rounded-full border border-[#d9d5c9] text-[#6b5d55] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center justify-center text-xs leading-none shrink-0 transition-colors";

  const dessertCheckbox = hasDessertOption && (
    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={withDessert}
        onChange={(e) => toggleWithDessert(e.target.checked)}
        className="sr-only"
      />
      <span
        className="w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors"
        style={{ borderColor: accentColor, backgroundColor: withDessert ? accentColor : "transparent" }}
      >
        {withDessert && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l6 6L20 6" />
          </svg>
        )}
      </span>
      <span className="font-serif italic text-[13px]" style={{ color: INK_MUTED }}>
        Avec dessert
      </span>
    </label>
  );

  // Champ chiffre éditable au clavier, partagé par le stepper de ligne
  // desktop (compact) et l'accordéon mobile (gabarit plus grand) — seule la
  // className change entre les deux appels ci-dessous.
  function qtyInputField(className: string) {
    return (
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={qtyInput}
        onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commitQtyInput}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Quantité pour ${product.name} (cliquer pour saisir directement)`}
        className={className}
        style={{ color: accentColor, borderColor: accentColor }}
      />
    );
  }

  // Stepper de ligne — affiché uniquement une fois la formule ajoutée (voir
  // addButton ci-dessous pour l'état "pas encore ajoutée").
  const lineStepper = (
    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => updateQuantity(quantity - 1)} className={lineStepperButtonClass} aria-label={`Retirer un ${product.name}`}>
        −
      </button>
      {qtyInputField(
        "font-serif italic text-base w-7 text-center bg-transparent outline-none border-b-0 border-dotted focus:border-b"
      )}
      <button onClick={() => updateQuantity(quantity + 1)} className={lineStepperButtonClass} aria-label={`Ajouter un ${product.name}`}>
        +
      </button>
      {unitLabel && (
        <span className="text-[10.5px] opacity-75" style={{ color: INK_MUTED }}>
          {unitLabel}
        </span>
      )}
    </div>
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
              <div className="flex items-center gap-3">
                <button onClick={() => updateQuantity(quantity - 1)} className={removeButtonClass}>
                  −
                </button>
                {qtyInputField("font-serif italic text-base w-8 text-center bg-transparent outline-none border-b-0 border-dotted focus:border-b")}
                <button onClick={() => updateQuantity(quantity + 1)} className={addButtonClass}>
                  +
                </button>
              </div>
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
