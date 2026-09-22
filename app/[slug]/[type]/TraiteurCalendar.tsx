"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addMonthsISO,
  formatMonthLabel,
  getClosedDatesInRange,
  getCurrentMonthISO,
  getMonthBounds,
  getMonthGrid,
  isTraiteurDateSelectable,
  monthOfDate,
  WEEKDAY_LABELS,
} from "@/lib/slots";
import { getMonthCapacityStatus, getMonthClosureDates } from "./actions";
import type { DayCapacityStatus } from "@/lib/db/queries";

export function TraiteurCalendar({
  slug,
  productIds,
  selectedDate,
  onSelectDate,
  accentColor,
  closedWeekdays,
}: {
  slug: string;
  productIds: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  accentColor: string;
  closedWeekdays: number[];
}) {
  const [monthISO, setMonthISO] = useState(() => monthOfDate(selectedDate) || getCurrentMonthISO());
  const [statusByDate, setStatusByDate] = useState<Map<string, DayCapacityStatus>>(new Map());
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const { start, end } = getMonthBounds(monthISO);
      const [statuses, closureDates] = await Promise.all([
        getMonthCapacityStatus(slug, productIds, monthISO),
        getMonthClosureDates(slug, monthISO, "traiteur"),
      ]);
      setStatusByDate(new Map(statuses.map((s) => [s.date, s])));
      setClosedDates(getClosedDatesInRange(closedWeekdays, closureDates, start, end));
    });
    // productIds est un tableau recréé à chaque rendu du parent (map sur le
    // panier) — on ne redéclenche que sur son contenu réel, pas sa référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, monthISO, JSON.stringify(productIds), JSON.stringify(closedWeekdays)]);

  const cells = getMonthGrid(monthISO);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-6 py-4 border-b border-stone-200">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setMonthISO((m) => addMonthsISO(m, -1))}
          className="text-stone-400 hover:text-stone-600 px-2"
          aria-label="Mois précédent"
        >
          ←
        </button>
        <p className="text-sm font-medium">{formatMonthLabel(monthISO)}</p>
        <button
          type="button"
          onClick={() => setMonthISO((m) => addMonthsISO(m, 1))}
          className="text-stone-400 hover:text-stone-600 px-2"
          aria-label="Mois suivant"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-stone-400 mb-2">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const status = statusByDate.get(cell.dateISO);
          const isPast = cell.dateISO < today;
          const isClosed = closedDates.has(cell.dateISO);
          const isSelectable = cell.inCurrentMonth && isTraiteurDateSelectable(cell.dateISO, closedDates);
          const isFull =
            !!status &&
            productIds.length > 0 &&
            productIds.every((id) => status.fullProductIds.includes(id));
          // Un jour fermé reçoit exactement le même traitement visuel qu'un
          // jour complet — pas un nouvel état à inventer, comme demandé.
          const isBarred = isFull || isClosed;
          const isNearLimit =
            !isBarred && !!status && productIds.some((id) => status.nearLimitProductIds.includes(id) || status.fullProductIds.includes(id));
          const isSelected = cell.dateISO === selectedDate;
          const disabled = !isSelectable || isPast || isFull;
          const dayNumber = Number(cell.dateISO.slice(8, 10));

          return (
            <button
              key={cell.dateISO}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(cell.dateISO)}
              className="relative aspect-square rounded-lg flex items-center justify-center text-xs disabled:cursor-not-allowed"
              style={{
                opacity: !cell.inCurrentMonth ? 0.3 : disabled ? 0.35 : 1,
                backgroundColor: isSelected ? accentColor : "transparent",
                color: isSelected ? "white" : isBarred ? "#a8a29e" : "#44403c",
                textDecoration: isBarred ? "line-through" : "none",
              }}
            >
              {dayNumber}
              {isNearLimit && !isSelected && (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full"
                  style={{ backgroundColor: "#b45309" }}
                  aria-label="Capacité presque atteinte ce jour"
                />
              )}
            </button>
          );
        })}
      </div>
      {isPending && <p className="text-[11px] text-stone-300 mt-2">Mise à jour des disponibilités…</p>}
    </div>
  );
}
