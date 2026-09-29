// Filet tricolore discret (vert/blanc/rouge désaturés, 3px) sous le bandeau
// de l'écran de choix et sous le bandeau noir du catalogue — détail sobre,
// couleurs fixes (pas de personnalisation par établissement, contrairement à
// accentColor) puisqu'il s'agit d'un clin d'œil de marque, pas d'un accent.
export function Tricolor() {
  return (
    <div className="flex h-[3px]">
      <span className="flex-1 bg-[#3d7a4f]" />
      <span className="flex-1 bg-[#f3ede0]" />
      <span className="flex-1 bg-[#a1382f]" />
    </div>
  );
}
