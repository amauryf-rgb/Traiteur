import { INK_MUTED, PAPER } from "@/lib/theme";

// Case "avec dessert" dans les couleurs de la charte (carré accent, coche
// blanche) plutôt que le checkbox natif — partagée entre l'ancien catalogue
// (MenuRow) et le tunnel de commande traiteur (étape 2), même composant
// visuel et même comportement partout où ce choix apparaît.
export function DessertCheckbox({
  checked,
  onChange,
  accentColor,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accentColor: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        className="w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors"
        style={{ borderColor: accentColor, backgroundColor: checked ? accentColor : "transparent" }}
      >
        {checked && (
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
}
