import Link from "next/link";
import { addMonthsISO, formatMonthLabel, getMonthBounds, WEEKDAY_LABELS, type CalendarCell } from "@/lib/slots";

export function MonthView({
  slug,
  monthISO,
  cells,
  countByDate,
  closedDates,
  today,
  busyThreshold,
  accentColor,
}: {
  slug: string;
  monthISO: string;
  cells: CalendarCell[];
  countByDate: Map<string, number>;
  closedDates: Set<string>;
  today: string;
  busyThreshold: number;
  accentColor: string;
}) {
  const { start: prevMonthAnchor } = getMonthBounds(addMonthsISO(monthISO, -1));
  const { start: nextMonthAnchor } = getMonthBounds(addMonthsISO(monthISO, 1));

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200">
        <Link href={`/${slug}/pro?view=month&date=${prevMonthAnchor}`} className="text-stone-400 hover:text-stone-600 px-2">
          ←
        </Link>
        <p className="text-sm font-medium">{formatMonthLabel(monthISO)}</p>
        <Link href={`/${slug}/pro?view=month&date=${nextMonthAnchor}`} className="text-stone-400 hover:text-stone-600 px-2">
          →
        </Link>
      </div>

      <div className="px-6 py-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-stone-400 mb-2">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i}>{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const count = countByDate.get(cell.dateISO) ?? 0;
            const isToday = cell.dateISO === today;
            const isClosed = closedDates.has(cell.dateISO);
            const isBusy = !isClosed && count > busyThreshold;
            const dayNumber = Number(cell.dateISO.slice(8, 10));

            return (
              <Link
                key={cell.dateISO}
                href={`/${slug}/pro?date=${cell.dateISO}`}
                className="aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5"
                style={{
                  opacity: cell.inCurrentMonth ? 1 : 0.35,
                  // "Aujourd'hui" garde toujours son fond plein pour rester
                  // identifiable — le hachuré "fermé" ne se dessine que sur
                  // les autres jours, sinon il masque entièrement le fond
                  // accent et le texte blanc devient illisible dessus.
                  backgroundColor: isToday ? accentColor : isBusy ? "#fef3c7" : isClosed ? undefined : "#fafaf9",
                  backgroundImage:
                    isClosed && !isToday
                      ? "repeating-linear-gradient(45deg, #e7e5e4, #e7e5e4 4px, #f5f5f4 4px, #f5f5f4 8px)"
                      : undefined,
                }}
              >
                <span
                  className="text-xs"
                  style={{
                    color: isToday ? "white" : isBusy ? "#b45309" : isClosed ? "#a8a29e" : "#57534e",
                    textDecoration: isToday && isClosed ? "line-through" : "none",
                  }}
                >
                  {dayNumber}
                </span>
                {count > 0 && (
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: isToday ? "white" : isBusy ? "#b45309" : "#a8a29e" }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px] text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#fef3c7" }} />
            Chargé
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #e7e5e4, #e7e5e4 2px, #f5f5f4 2px, #f5f5f4 4px)" }}
            />
            Fermé
          </span>
        </div>
      </div>
    </>
  );
}
