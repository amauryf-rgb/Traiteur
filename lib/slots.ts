// Créneaux de retrait — l'établissement n'a pas encore d'horaires
// d'ouverture configurables en base (hors périmètre du schéma actuel), donc
// une plage fixe raisonnable sert de valeur par défaut pour le pilote.
const OPENING_HOUR = 10;
const CLOSING_HOUR = 19;
const STEP_MINUTES = 30;
const BOUTIQUE_LEAD_MINUTES = 30;
const TRAITEUR_LEAD_DAYS = 1;
const TRAITEUR_WINDOW_DAYS = 21;

const ZURICH_TZ = "Europe/Zurich";

function zurichParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    minutesSinceMidnight: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function allDaySlots(): string[] {
  const slots: string[] = [];
  for (let m = OPENING_HOUR * 60; m <= CLOSING_HOUR * 60; m += STEP_MINUTES) {
    const h = Math.floor(m / 60)
      .toString()
      .padStart(2, "0");
    const mm = (m % 60).toString().padStart(2, "0");
    slots.push(`${h}:${mm}`);
  }
  return slots;
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function formatDateLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function getTodayISO(): string {
  return zurichParts(new Date()).dateISO;
}

// Vente au comptoir : retrait immédiat, l'heure de la commande fait office
// de créneau (arrondie à la minute la plus proche pour rester lisible).
export function getCurrentTimeISO(): string {
  const { minutesSinceMidnight } = zurichParts(new Date());
  const h = Math.floor(minutesSinceMidnight / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutesSinceMidnight % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Boutique : retrait le jour même uniquement, dans les créneaux restants.
export function getBoutiqueDate(): string {
  return getTodayISO();
}

export function getBoutiqueTimes(): string[] {
  const { minutesSinceMidnight } = zurichParts(new Date());
  const earliest = minutesSinceMidnight + BOUTIQUE_LEAD_MINUTES;
  return allDaySlots().filter((slot) => {
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m >= earliest;
  });
}

// Traiteur : commande à l'avance, à partir du lendemain. closedDates (jours
// fermés, hebdomadaires + ponctuels combinés) est optionnel pour ne pas
// casser un appelant qui n'a pas encore cette info — mais tout appelant réel
// doit le passer, sinon un jour fermé resterait proposable.
export function getTraiteurDates(closedDates: Set<string> = new Set()): string[] {
  const today = zurichParts(new Date()).dateISO;
  const dates: string[] = [];
  for (let i = TRAITEUR_LEAD_DAYS; i <= TRAITEUR_WINDOW_DAYS; i++) {
    const date = addDaysISO(today, i);
    if (!closedDates.has(date)) dates.push(date);
  }
  return dates;
}

export function getTraiteurTimes(): string[] {
  return allDaySlots();
}

export function getTraiteurWindowBounds(): { start: string; end: string } {
  const today = zurichParts(new Date()).dateISO;
  return { start: addDaysISO(today, TRAITEUR_LEAD_DAYS), end: addDaysISO(today, TRAITEUR_WINDOW_DAYS) };
}

// Un jour est sélectionnable pour une commande traiteur uniquement dans la
// fenêtre [J+TRAITEUR_LEAD_DAYS, J+TRAITEUR_WINDOW_DAYS] ET pas fermé — un
// jour fermé est traité exactement comme un jour complet dans le reste de la
// logique (non sélectionnable), pas un nouvel état à gérer séparément.
export function isTraiteurDateSelectable(dateISO: string, closedDates: Set<string> = new Set()): boolean {
  const today = zurichParts(new Date()).dateISO;
  return (
    dateISO >= addDaysISO(today, TRAITEUR_LEAD_DAYS) &&
    dateISO <= addDaysISO(today, TRAITEUR_WINDOW_DAYS) &&
    !closedDates.has(dateISO)
  );
}

// Combine closed_weekdays (récurrence, expansion pure sur la plage) et les
// lignes de establishment_closures (dates ponctuelles) en un seul ensemble
// de dates ISO fermées — calculé une fois par plage affichée (mois), jamais
// par case de calendrier, exactement comme le statut de capacité.
export function getClosedDatesInRange(
  closedWeekdays: number[],
  closureDates: string[],
  rangeStart: string,
  rangeEnd: string
): Set<string> {
  const closed = new Set<string>(closureDates);
  if (closedWeekdays.length === 0) return closed;

  const weekdaySet = new Set(closedWeekdays);
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    const [y, m, d] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekdaySet.has(weekday)) closed.add(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return closed;
}

// ---------------------------------------------------------------------
// Grille de calendrier mensuel — partagée entre le calendrier client
// (tunnel traiteur) et la vue mensuelle du dashboard pro, pour ne pas
// dupliquer l'arithmétique de mois à deux endroits.
// ---------------------------------------------------------------------

export type CalendarCell = { dateISO: string; inCurrentMonth: boolean };

function parseMonthISO(monthISO: string): { year: number; month: number } {
  const [year, month] = monthISO.split("-").map(Number);
  return { year, month };
}

export function getCurrentMonthISO(): string {
  return zurichParts(new Date()).dateISO.slice(0, 7);
}

export function monthOfDate(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function addMonthsISO(monthISO: string, delta: number): string {
  const { year, month } = parseMonthISO(monthISO);
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

export function getMonthBounds(monthISO: string): { start: string; end: string } {
  const { year, month } = parseMonthISO(monthISO);
  const start = `${monthISO}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${monthISO}-${String(daysInMonth).padStart(2, "0")}`;
  return { start, end };
}

export function formatMonthLabel(monthISO: string): string {
  const { year, month } = parseMonthISO(monthISO);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("fr-CH", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Grille 7 colonnes (lundi à dimanche), complétée par les jours de bordure
// du mois précédent/suivant pour que chaque semaine soit complète.
export function getMonthGrid(monthISO: string): CalendarCell[] {
  const { start, end } = getMonthBounds(monthISO);
  const { year, month } = parseMonthISO(monthISO);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay() : 0=dimanche..6=samedi — converti en index lundi-first (0=lundi..6=dimanche).
  const firstWeekdayIndex = (firstOfMonth.getUTCDay() + 6) % 7;

  const cells: CalendarCell[] = [];
  for (let i = firstWeekdayIndex; i > 0; i--) {
    cells.push({ dateISO: addDaysISO(start, -i), inCurrentMonth: false });
  }

  let cursor = start;
  while (cursor <= end) {
    cells.push({ dateISO: cursor, inCurrentMonth: true });
    cursor = addDaysISO(cursor, 1);
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dateISO: addDaysISO(cells[cells.length - 1].dateISO, 1), inCurrentMonth: false });
  }

  return cells;
}

export const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
