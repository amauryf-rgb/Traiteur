import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getCapacityRulesForProducts,
  getClosuresInRange,
  getEstablishmentBySlug,
  getOrderCountsForMonth,
  getOrdersForDate,
  getProductionLotsForDate,
  getStaffForEstablishment,
  getStaffOrderTypeScope,
  getTasksForStaffMember,
} from "@/lib/db/queries";
import type { OrderType } from "@/lib/types";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import { aggregateByProduct } from "@/lib/aggregate";
import { closureDatesForType, getClosedDatesInRange, getMonthBounds, getMonthGrid, getTodayISO, monthOfDate } from "@/lib/slots";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { EmployeePlanning } from "./EmployeePlanning";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";

// Seuil "jour chargé" pour la vue mensuelle — constante pour l'instant
// (session cadrée présentation, pas de migration de schéma). Facilement
// promouvable en champ de config par établissement le jour où un écran de
// réglages existe : voir alertThresholdPct sur product_capacity_rules pour
// le patron équivalent déjà en place au niveau produit.
const BUSY_DAY_ORDER_THRESHOLD = 8;

export default async function ProDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; view?: string; all?: string }>;
}) {
  const { slug } = await params;
  const { date: dateParam, view: viewParam, all: allParam } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) {
    redirect(`/${slug}/pro/login`);
  }
  const { session, context } = staffTenant;

  const today = getTodayISO();

  // Accès allégé employé (écran 10) : uniquement ses propres tâches du jour,
  // sans prix ni informations client — jamais le planning général.
  if (session.role === "employee") {
    const tasks = await runAsTenant(context, (tx) => getTasksForStaffMember(tx, session.staffMemberId, today));
    return (
      <EmployeePlanning
        slug={slug}
        establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
        staffName={session.name}
        tasks={tasks}
      />
    );
  }

  const view = viewParam === "month" ? "month" : "day";
  const date = dateParam ?? today;
  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const isOwner = session.role === "owner";

  // Rattachement à un univers (traiteur/boutique) via l'entité juridique du
  // membre connecté — ex. Richard (Boutique Sàrl) ne voit par défaut que les
  // commandes boutique, Michele que le traiteur. Null pour un établissement
  // mono-entité (rien à filtrer) ou un membre sans entité renseignée.
  const scope = await runAsTenant(context, (tx) => getStaffOrderTypeScope(tx, session.staffMemberId));
  const showAll = scope === null || allParam === "1";

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner={isOwner}
      active="planning"
    >
      <ProPanel>
        <div className="flex items-center justify-between gap-3 px-6 py-2 border-b border-stone-200 text-xs">
          <div className="flex items-center gap-3">
            <Link
              href={`/${slug}/pro?date=${date}${showAll && scope ? "&all=1" : ""}`}
              className="pb-1"
              style={view === "day" ? { borderBottom: `2px solid ${accentColor}`, color: accentColor } : { color: "#a8a29e" }}
            >
              Jour
            </Link>
            <Link
              href={`/${slug}/pro?view=month&date=${date}`}
              className="pb-1"
              style={view === "month" ? { borderBottom: `2px solid ${accentColor}`, color: accentColor } : { color: "#a8a29e" }}
            >
              Mois
            </Link>
          </div>

          {/* Filtre par univers (traiteur/boutique) — seulement pour un membre
              rattaché à une entité mono-univers (ex. Richard/Boutique,
              Michele/Traiteur). Toujours possible de repasser en "Voir tout" :
              on filtre l'affichage par défaut, on ne retire jamais l'accès. */}
          {view === "day" && scope && (
            <Link href={`/${slug}/pro?date=${date}${showAll ? "" : "&all=1"}`} className="underline underline-offset-2 text-stone-400 hover:text-stone-600">
              {showAll ? `Filtrer : ${scope === "traiteur" ? "Traiteur" : "Boutique"} uniquement` : "Voir tout (traiteur + boutique)"}
            </Link>
          )}
        </div>

        {view === "month" ? (
          <MonthViewSection
            slug={slug}
            establishmentId={establishment.id}
            closedWeekdaysTraiteur={establishment.closedWeekdaysTraiteur}
            closedWeekdaysBoutique={establishment.closedWeekdaysBoutique}
            date={date}
            today={today}
            context={context}
            accentColor={accentColor}
          />
        ) : (
          <DayViewSection
            slug={slug}
            establishmentId={establishment.id}
            date={date}
            today={today}
            context={context}
            accentColor={accentColor}
            scope={showAll ? null : scope}
          />
        )}
      </ProPanel>
    </ProShell>
  );
}

async function DayViewSection({
  slug,
  establishmentId,
  date,
  today,
  context,
  accentColor,
  scope,
}: {
  slug: string;
  establishmentId: string;
  date: string;
  today: string;
  context: TenantContext;
  accentColor: string;
  scope: OrderType | null;
}) {
  const isToday = date === today;

  const { activeOrders, aggregated, dailyMaxByProduct, lotsByProduct, staff } = await runAsTenant(context, async (tx) => {
    const allDayOrders = await getOrdersForDate(tx, establishmentId, date);
    // Filtre par univers (voir ProDashboardPage) : appliqué ici, en amont de
    // tout le reste, pour que la liste des commandes ET l'agrégat "à
    // produire" restent cohérents entre eux sans dupliquer la condition.
    const dayOrders = scope ? allDayOrders.filter((o) => o.orderType === scope) : allDayOrders;
    const activeOrders = dayOrders.filter((o) => o.status !== "cancelled");
    // Une commande assignée en entier (orders.assignedTo) est exclue de
    // l'agrégat "à produire" : son détail vit dans la colonne Commandes, pas
    // ici — sinon ses articles seraient comptés deux fois (piège n°2 validé
    // avec l'utilisateur avant ce chantier).
    const aggregated = aggregateByProduct(dayOrders.filter((o) => !o.assignedTo));

    const rules = await getCapacityRulesForProducts(tx, aggregated.map((a) => a.productId));
    const dailyMaxByProduct = new Map<string, number>();
    for (const rule of rules) {
      if (rule.scope === "per_day") dailyMaxByProduct.set(rule.productId, rule.maxQuantity);
    }

    const lots = await getProductionLotsForDate(tx, establishmentId, date);
    const lotsByProduct = new Map<string, typeof lots>();
    for (const lot of lots) {
      const list = lotsByProduct.get(lot.productId) ?? [];
      list.push(lot);
      lotsByProduct.set(lot.productId, list);
    }
    const staff = await getStaffForEstablishment(tx, establishmentId);

    return { activeOrders, aggregated, dailyMaxByProduct, lotsByProduct, staff };
  });

  return (
    <DayView
      slug={slug}
      date={date}
      isToday={isToday}
      activeOrders={activeOrders}
      aggregated={aggregated}
      dailyMaxByProduct={dailyMaxByProduct}
      lotsByProduct={lotsByProduct}
      staff={staff}
      accentColor={accentColor}
    />
  );
}

async function MonthViewSection({
  slug,
  establishmentId,
  closedWeekdaysTraiteur,
  closedWeekdaysBoutique,
  date,
  today,
  context,
  accentColor,
}: {
  slug: string;
  establishmentId: string;
  closedWeekdaysTraiteur: number[];
  closedWeekdaysBoutique: number[];
  date: string;
  today: string;
  context: TenantContext;
  accentColor: string;
}) {
  const monthISO = monthOfDate(date);
  const { start, end } = getMonthBounds(monthISO);
  const cells = getMonthGrid(monthISO);

  const { counts, closureRows } = await runAsTenant(context, async (tx) => {
    const counts = await getOrderCountsForMonth(tx, establishmentId, start, end);
    const closureRows = await getClosuresInRange(tx, establishmentId, start, end);
    return { counts, closureRows };
  });
  const countByDate = new Map(counts.map((c) => [c.date, c.count]));
  // Vue mensuelle non filtrée par univers (contrairement au planning du
  // jour) : un jour n'est marqué "fermé" que s'il l'est pour les DEUX
  // univers à la fois — sinon des commandes restent possibles ce jour-là,
  // "fermé" serait trompeur pour le propriétaire qui regarde l'ensemble.
  const closedTraiteur = getClosedDatesInRange(closedWeekdaysTraiteur, closureDatesForType(closureRows, "traiteur"), start, end);
  const closedBoutique = getClosedDatesInRange(closedWeekdaysBoutique, closureDatesForType(closureRows, "boutique"), start, end);
  const closedDates = new Set([...closedTraiteur].filter((d) => closedBoutique.has(d)));

  return (
    <MonthView
      slug={slug}
      monthISO={monthISO}
      cells={cells}
      countByDate={countByDate}
      closedDates={closedDates}
      today={today}
      busyThreshold={BUSY_DAY_ORDER_THRESHOLD}
      accentColor={accentColor}
    />
  );
}
