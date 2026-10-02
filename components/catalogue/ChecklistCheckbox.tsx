import { INK_MUTED, PAPER, PAPER_LINE } from "@/lib/theme";

// Case à cocher générique pour un élément de détail de formule (component de
// type 'include') — même langage visuel que DessertCheckbox (carré accent,
// coche blanche) mais avec un libellé variable et une mise en page en ligne
// complète (checkbox à gauche, libellé qui prend toute la largeur), pour la
// liste de détail de l'étape 2 plutôt qu'un contrôle inline ponctuel.
export function ChecklistCheckbox({
  label,
  checked,
  onChange,
  accentColor,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accentColor: string;
}) {
  return (
    <label
      className="flex items-center gap-2.5 py-2.5 border-b border-dotted cursor-pointer select-none"
      style={{ borderColor: PAPER_LINE }}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        className="w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors"
        style={{ borderColor: accentColor, backgroundColor: checked ? accentColor : "transparent" }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l6 6L20 6" />
          </svg>
        )}
      </span>
      <span
        className="font-serif text-sm flex-1"
        style={checked ? undefined : { color: INK_MUTED, textDecoration: "line-through" }}
      >
        {label}
      </span>
    </label>
  );
}
