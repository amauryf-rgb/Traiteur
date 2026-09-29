// Palette "caractère" (voir demo-caractere-photo-v4-noir-italie.html) — fond
// crème + gris chaud, utilisée sur l'écran de choix et le catalogue client
// uniquement. Le reste du site (pro, admin) garde sa palette stone/white
// actuelle, hors périmètre de ce chantier.
//
// INK_MUTED remplace text-stone-400/500 pour tout texte à lire sur ces deux
// écrans : stone-400 (#a8a29e) tombe à 2.28:1 de contraste sur PAPER, très en
// dessous du seuil WCAG AA (4.5:1) — INK_MUTED atteint 5.72:1.
export const PAPER = "#f7f3ec";
export const PAPER_LINE = "#d9d5c9";
export const INK = "#1f1310";
export const INK_MUTED = "#6b5d55";
export const BRAND_BLACK = "#111110";

// Grain papier très subtil (bruit fractal SVG, opacité 3.5%) — même technique
// que la démo, en data URI pour rester autonome sans fichier image.
export const GRAIN_BACKGROUND_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")";

export const GRAIN_STYLE: React.CSSProperties = {
  backgroundColor: PAPER,
  backgroundImage: GRAIN_BACKGROUND_IMAGE,
};

// Alpha ~7% en hex à 8 chiffres (#RRGGBBAA), pour teinter accentColor sans
// connaître sa valeur à l'avance (même principe que --accent-tint dans la
// démo, calculé ici plutôt que codé en dur puisque accentColor est dynamique
// par établissement).
export function accentTint(accentColor: string): string {
  return `${accentColor}12`;
}
