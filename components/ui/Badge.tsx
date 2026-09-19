// Badges de statut — sémantiques, jamais personnalisés par établissement
// (contrairement aux boutons) : "prêt" doit se lire pareil chez tous les
// traiteurs de la plateforme, sinon la couleur perd son sens opérationnel.
const TONE_CLASSES = {
  neutral: "bg-stone-100 text-stone-600",
  info: "bg-blue-50 text-blue-700",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
