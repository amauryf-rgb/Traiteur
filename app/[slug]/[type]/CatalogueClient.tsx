"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CatalogueHeader } from "./CatalogueHeader";
import { saveCheckoutState, useCart, useGuestCount } from "@/lib/cart";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { Button } from "@/components/ui/Button";
import { Ornament } from "@/components/Ornament";
import { GRAIN_STYLE, INK_MUTED, PAPER_LINE, accentTint } from "@/lib/theme";
import { reserveSlot } from "./actions";
import { TraiteurCalendar } from "./TraiteurCalendar";
import { MenuRow } from "./MenuRow";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { OrderType } from "@/lib/types";

type Establishment = { name: string; tagline: string | null; accentColor: string | null; logoUrl?: string | null };

// appearance-none neutralise la flèche native sur tous les navigateurs (pas
// seulement Safari — Chrome/Firefox n'avaient simplement jamais eu de style
// personnalisé non plus, juste une flèche native qui passait plus inaperçue).
// Chevron ré-ajouté à la main en arrière-plan plutôt qu'en classe Tailwind
// arbitraire, pour éviter les soucis d'échappement de guillemets d'une data
// URI dans une className.
const SELECT_CLASS_NAME = "appearance-none bg-transparent bg-no-repeat font-serif text-[17px] outline-none w-full pr-5";
const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236b5d55' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundPosition: "right center",
  backgroundSize: "12px",
};

// Icônes fines (trait, pas de fond plein) — mêmes tracés que la démo widget
// et l'écran de choix (crate pour Retrait), cohérence de charte.
const RETRAIT_ICON = (
  <>
    <rect x="4" y="5" width="16" height="15" rx="1.5" />
    <path d="M4 9.5h16" />
    <path d="M8 3v3M16 3v3" />
  </>
);
const HEURE_ICON = (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);
const PEOPLE_ICON = (
  <>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
  </>
);
const INFO_ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.01M11 11h1v5h1" />
  </>
);

function FieldIcon({ children, accentColor }: { children: React.ReactNode; accentColor: string }) {
  return (
    <span
      className="flex items-center justify-center w-[34px] h-[34px] rounded-full shrink-0"
      style={{ backgroundColor: accentTint(accentColor) }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const EYEBROW: Record<OrderType, string> = {
  boutique: "Boutique du jour",
  traiteur: "Commande traiteur",
};

export function CatalogueClient({
  slug,
  orderType,
  establishment,
  clientName,
  products,
  dates,
  times,
  closedWeekdays,
  signatureName,
}: {
  slug: string;
  orderType: OrderType;
  establishment: Establishment;
  clientName: string | null;
  products: CatalogueProduct[];
  dates: string[];
  times: string[];
  closedWeekdays: number[];
  signatureName: string | null;
}) {
  const router = useRouter();
  const cart = useCart(slug, orderType);
  const { guestCount, setGuestCount } = useGuestCount(slug, orderType);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [selectedTime, setSelectedTime] = useState(times[0] ?? "");
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [dateView, setDateView] = useState<"liste" | "calendrier">("liste");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Champ texte libre pour la saisie directe du nombre de personnes (en plus
  // des +/-) : état local pour permettre de vider le champ le temps de taper
  // une nouvelle valeur, sans que ça retombe aussitôt sur "1". Se resynchronise
  // avec guestCount (source de vérité, localStorage) via le pattern React
  // "Adjusting state when a prop changes" plutôt qu'un effet — même logique
  // que le choix dessert dans MenuRow.
  const [guestCountInput, setGuestCountInput] = useState(String(guestCount));
  const [syncedGuestCount, setSyncedGuestCount] = useState(guestCount);
  if (guestCount !== syncedGuestCount) {
    setSyncedGuestCount(guestCount);
    setGuestCountInput(String(guestCount));
  }

  function commitGuestCountInput() {
    const parsed = parseInt(guestCountInput, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setGuestCount(parsed);
    } else {
      setGuestCountInput(String(guestCount));
    }
  }

  // Ordre des onglets = categories.sortOrder (configuré par le pro), pas
  // l'ordre d'apparition des produits en base qui serait arbitraire.
  const categories = useMemo(() => {
    const orderByName = new Map<string, number>();
    for (const p of products) {
      if (p.categoryName && !orderByName.has(p.categoryName)) {
        orderByName.set(p.categoryName, p.categorySortOrder ?? 0);
      }
    }
    const sorted = Array.from(orderByName.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    return ["Tout", ...sorted];
  }, [products]);

  const visibleProducts = activeCategory === "Tout" ? products : products.filter((p) => p.categoryName === activeCategory);
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  // Quantité proposée par défaut à l'ajout d'une nouvelle formule : le solde
  // de convives pas encore affecté à une autre formule, pas bêtement le
  // nombre de personnes global repris tel quel à chaque ajout — sinon,
  // ajouter une 2e formule alors qu'une 1re a déjà 25 personnes (pour 25
  // convives au total) proposerait encore 25, ce qui donnerait 50 au total.
  // Plancher à 1 (jamais 0, qui ramènerait la ligne à l'état "pas ajoutée")
  // pour laisser la main au client sans jamais bloquer un ajout.
  const remainingGuests = Math.max(1, guestCount - cart.totalItems);

  // Numérotation continue (01, 02, 03…) sur l'ensemble des produits visibles,
  // jamais remise à zéro par section — comme dans la démo, où les sections ne
  // sont qu'un regroupement visuel, pas une nouvelle liste.
  const productIndex = useMemo(() => {
    const map = new Map<string, number>();
    visibleProducts.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [visibleProducts]);

  // Sous-titre de section (renseigné par le pro, écran catalogue) : regroupe
  // les produits partageant le même intitulé sous un même titre de section,
  // affiché en 2 colonnes sur desktop. Tant qu'aucune section n'est
  // configurée pour la catégorie active, tout tombe dans un seul groupe
  // sans titre — liste simple, comportement identique à avant ce chantier.
  const sections = useMemo(() => {
    const bySection = new Map<string, CatalogueProduct[]>();
    for (const p of visibleProducts) {
      const key = p.sectionTitle ?? "";
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(p);
    }
    return Array.from(bySection.entries());
  }, [visibleProducts]);
  const useColumns = sections.length > 1;

  function quantityFor(productId: string) {
    return cart.items.find((line) => line.productId === productId)?.quantity ?? 0;
  }

  // Coché par défaut (avant tout ajout) — reflète ensuite fidèlement le choix
  // déjà fait pour cette ligne, y compris après un rechargement de page : sans
  // ça, la case revenait toujours à "avec dessert" au remontage du composant
  // alors que le panier (source de vérité) gardait le bon prix.
  function withDessertFor(productId: string) {
    return cart.items.find((line) => line.productId === productId)?.withDessert ?? true;
  }

  function updateQuantity(product: CatalogueProduct, quantity: number, withDessert?: boolean) {
    const price =
      withDessert === false && product.priceAmountNoDessert != null ? Number(product.priceAmountNoDessert) : Number(product.priceAmount);
    cart.setQuantity({ id: product.id, name: product.name, price, withDessert }, Math.max(0, quantity));
  }

  function handleContinue() {
    setError(null);
    if (!selectedTime) {
      setError("Choisissez un créneau de retrait.");
      return;
    }
    startTransition(async () => {
      const result = await reserveSlot({
        slug,
        orderType,
        date: selectedDate,
        time: selectedTime,
        items: cart.items.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      saveCheckoutState(slug, orderType, {
        reservationIds: result.reservationIds,
        expiresAt: result.expiresAt,
        date: selectedDate,
        time: selectedTime,
        items: cart.items,
      });
      router.push(`/${slug}/${orderType}/recapitulatif`);
    });
  }

  if (times.length === 0) {
    return (
      <div className="min-h-screen" style={GRAIN_STYLE}>
        <CatalogueHeader
          slug={slug}
          orderType={orderType}
          establishment={establishment}
          clientName={clientName}
          ctaLabel="Voir le panier"
          ctaDisabled
          onCtaClick={() => {}}
        />
        <p className="max-w-4xl mx-auto px-6 py-10 text-center text-sm" style={{ color: INK_MUTED }}>
          Aucun créneau de retrait disponible pour aujourd&apos;hui. Revenez demain.
        </p>
      </div>
    );
  }

  const fieldLabelClass = "block text-[10.5px] uppercase tracking-wide";

  const dateTimeSelector =
    orderType === "traiteur" && dateView === "calendrier" ? (
      <>
        <TraiteurCalendar
          slug={slug}
          productIds={cart.items.map((line) => line.productId)}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          accentColor={accentColor}
          closedWeekdays={closedWeekdays}
        />
        <div className="flex items-center gap-2.5 px-6 py-2.5" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
          <FieldIcon accentColor={accentColor}>{HEURE_ICON}</FieldIcon>
          <label className="flex-1 text-left">
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>Heure</span>
            <select
              className={SELECT_CLASS_NAME}
              style={SELECT_ARROW_STYLE}
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
            >
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
        </div>
      </>
    ) : (
      <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
        <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderRight: `1px solid ${PAPER_LINE}` }}>
          <FieldIcon accentColor={accentColor}>{RETRAIT_ICON}</FieldIcon>
          <label className="flex-1 text-left">
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>Retrait</span>
            {orderType === "boutique" ? (
              <span className="block font-serif text-[17px]">Aujourd&apos;hui</span>
            ) : (
              <select
                className={SELECT_CLASS_NAME}
                style={SELECT_ARROW_STYLE}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <FieldIcon accentColor={accentColor}>{HEURE_ICON}</FieldIcon>
          <label className="flex-1 text-left">
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>Heure</span>
            <select
              className={SELECT_CLASS_NAME}
              style={SELECT_ARROW_STYLE}
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
            >
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );

  const cartSummary = (
    <>
      <p className="text-xs" style={{ color: INK_MUTED }}>
        {cart.totalItems} article{cart.totalItems > 1 ? "s" : ""}
      </p>
      <p className="text-sm font-medium">{formatCHF(cart.totalAmount)}</p>
    </>
  );

  return (
    <div className="min-h-screen pb-28" style={GRAIN_STYLE}>
      <CatalogueHeader
        slug={slug}
        orderType={orderType}
        establishment={establishment}
        clientName={clientName}
        ctaLabel={isPending ? "Réservation…" : "Voir le panier"}
        ctaDisabled={cart.totalItems === 0 || isPending}
        onCtaClick={handleContinue}
      />

      <div className="text-center px-6 pt-8 pb-8">
        <Ornament color={accentColor} />
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: accentColor }}>
          {EYEBROW[orderType]}
        </p>
        {establishment.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={establishment.logoUrl} alt={establishment.name} className="h-14 sm:h-16 w-auto mx-auto object-contain" />
        ) : (
          <h1 className="font-serif text-3xl sm:text-4xl">{establishment.name}</h1>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6">
        {orderType === "traiteur" && (
          <div className="flex justify-end gap-3 pt-3 text-xs pb-2">
            <button
              onClick={() => setDateView("liste")}
              style={dateView === "liste" ? { color: accentColor, fontWeight: 500 } : { color: INK_MUTED }}
            >
              Liste
            </button>
            <button
              onClick={() => setDateView("calendrier")}
              style={dateView === "calendrier" ? { color: accentColor, fontWeight: 500 } : { color: INK_MUTED }}
            >
              Calendrier
            </button>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${PAPER_LINE}` }}>{dateTimeSelector}</div>

        {orderType === "traiteur" && (
          <div className="px-6 py-5 text-center" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
              Nombre de personnes
            </span>
            <div className="flex items-center justify-center gap-[22px] mt-3">
              <button
                type="button"
                onClick={() => setGuestCount(guestCount - 1)}
                aria-label="Retirer une personne"
                className="flex items-center justify-center w-10 h-10 rounded-full font-serif text-xl shrink-0"
                style={{ border: `1px solid ${accentColor}`, color: accentColor }}
              >
                −
              </button>
              <div className="flex flex-col items-center gap-0.5 min-w-[84px]">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={guestCountInput}
                  onChange={(e) => setGuestCountInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={commitGuestCountInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  aria-label="Nombre de personnes (cliquer pour saisir directement)"
                  className="font-serif italic text-[38px] leading-none text-center bg-transparent outline-none w-[70px] border-b-0 border-dotted focus:border-b"
                  style={{ color: accentColor, borderColor: accentColor }}
                />
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.6" className="opacity-55 mt-0.5">
                  {PEOPLE_ICON}
                </svg>
              </div>
              <button
                type="button"
                onClick={() => setGuestCount(guestCount + 1)}
                aria-label="Ajouter une personne"
                className="flex items-center justify-center w-10 h-10 rounded-full font-serif text-xl shrink-0"
                style={{ border: `1px solid ${accentColor}`, color: accentColor }}
              >
                +
              </button>
            </div>
            <div
              className="flex items-start gap-2 mt-4 px-3.5 py-2.5 rounded-md text-xs text-left leading-relaxed"
              style={{ backgroundColor: accentTint(accentColor), color: INK_MUTED }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.5" className="shrink-0 mt-0.5">
                {INFO_ICON}
              </svg>
              <span>
                Les prix du catalogue sont par personne — la quantité de chaque formule s&apos;ajuste automatiquement
                selon ce nombre. Il est possible de choisir plusieurs formules pour une commande.
              </span>
            </div>
          </div>
        )}

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

        <div className={`py-6 ${useColumns ? "lg:columns-2 lg:gap-x-14" : ""}`}>
          {sections.map(([title, items]) => (
            <div key={title || "_none"} className="break-inside-avoid mb-8 last:mb-0">
              {title && (
                <p className="font-serif italic text-lg mb-3" style={{ color: accentColor }}>
                  {title}
                </p>
              )}
              <div>
                {items.map((product) => (
                  <MenuRow
                    key={product.id}
                    product={product}
                    index={productIndex.get(product.id) ?? 0}
                    quantity={quantityFor(product.id)}
                    initialWithDessert={withDessertFor(product.id)}
                    defaultQuantity={orderType === "traiteur" ? remainingGuests : 1}
                    unitLabel={orderType === "traiteur" ? "pers." : undefined}
                    accentColor={accentColor}
                    isOpen={openProductId === product.id}
                    onToggleOpen={() => setOpenProductId((prev) => (prev === product.id ? null : product.id))}
                    onUpdateQuantity={(quantity, withDessert) => updateQuantity(product, quantity, withDessert)}
                  />
                ))}
              </div>
            </div>
          ))}
          {visibleProducts.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: INK_MUTED }}>Aucun produit dans cette catégorie.</p>
          )}
        </div>

        {orderType === "traiteur" && (
          <div className="px-6 pt-4 text-center text-xs leading-relaxed" style={{ color: INK_MUTED, borderTop: `1px solid ${PAPER_LINE}` }}>
            <p>
              Nous nous tenons à votre disposition pour vous renseigner sur les ingrédients présents dans nos plats
              qui sont susceptibles de provoquer des allergies ou des intolérances.
            </p>
            <p className="mt-1.5">
              Provenances — Poulet : Suisse · Bœuf : Suisse · Charcuterie : Italie · Pain/Focaccia : Suisse.
            </p>
          </div>
        )}

        {signatureName && (
          <div className="text-center pt-2 pb-6" style={{ borderTop: orderType === "traiteur" ? "none" : `1px solid ${PAPER_LINE}` }}>
            <p className="font-serif italic text-[15px] pt-4" style={{ color: INK_MUTED }}>
              Buon appetito, {signatureName}.
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0" style={{ ...GRAIN_STYLE, borderTop: `1px solid ${PAPER_LINE}` }}>
        {error && <p className="max-w-4xl mx-auto bg-red-50 text-red-700 text-xs px-6 py-2 text-center">{error}</p>}
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>{cartSummary}</div>
          <Button onClick={handleContinue} disabled={cart.totalItems === 0 || isPending} accentColor={accentColor}>
            {isPending ? "Réservation…" : "Voir le panier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
