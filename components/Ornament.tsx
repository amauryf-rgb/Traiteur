// Ornement discret (trait-point-trait) au-dessus d'un titre de section —
// couleur d'accent de l'établissement, comme les autres éléments graphiques
// personnalisables (prix, numérotation, icônes).
export function Ornament({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-1">
      <span className="w-[22px] h-px opacity-50" style={{ backgroundColor: color }} />
      <span className="w-[3px] h-[3px] rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="w-[22px] h-px opacity-50" style={{ backgroundColor: color }} />
    </div>
  );
}
