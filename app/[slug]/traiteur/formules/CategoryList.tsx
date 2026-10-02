"use client";

import { INK_MUTED, PAPER_LINE } from "@/lib/theme";

// Niveau 1 du parcours de sélection de formule — un bouton par catégorie
// distincte du catalogue (ex. Cocktail dînatoire / Buffet apéritif / Menu).
// Pas d'icône ni de description par catégorie : ces champs n'existent pas
// dans le modèle actuel (juste un nom), et le pro peut créer un nombre
// arbitraire de catégories avec des noms arbitraires — un texte seul reste
// robuste à ça, contrairement à une icône fixe par nom connu.
export function CategoryList({
  categories,
  accentColor,
  onSelect,
}: {
  categories: string[];
  accentColor: string;
  onSelect: (category: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 mt-1" style={{ "--accent": accentColor } as React.CSSProperties}>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          className="flex items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: PAPER_LINE }}
        >
          <span className="font-serif text-[15px] flex-1">{category}</span>
          <span className="font-serif italic" style={{ color: INK_MUTED }}>
            →
          </span>
        </button>
      ))}
    </div>
  );
}
