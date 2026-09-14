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

function addDaysISO(dateISO: string, days: number): string {
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

// Boutique : retrait le jour même uniquement, dans les créneaux restants.
export function getBoutiqueDate(): string {
  return zurichParts(new Date()).dateISO;
}

export function getBoutiqueTimes(): string[] {
  const { minutesSinceMidnight } = zurichParts(new Date());
  const earliest = minutesSinceMidnight + BOUTIQUE_LEAD_MINUTES;
  return allDaySlots().filter((slot) => {
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m >= earliest;
  });
}

// Traiteur : commande à l'avance, à partir du lendemain.
export function getTraiteurDates(): string[] {
  const today = zurichParts(new Date()).dateISO;
  const dates: string[] = [];
  for (let i = TRAITEUR_LEAD_DAYS; i <= TRAITEUR_WINDOW_DAYS; i++) {
    dates.push(addDaysISO(today, i));
  }
  return dates;
}

export function getTraiteurTimes(): string[] {
  return allDaySlots();
}
