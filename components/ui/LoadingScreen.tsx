// Fallback affiché par Next.js pendant qu'une route dynamique se rend côté
// serveur (voir les loading.tsx qui l'utilisent) — volontairement neutre
// (aucune couleur d'accent par établissement) car un loading.tsx ne peut
// pas lire de données ; but réel : remplacer l'écran figé par un retour
// visuel immédiat au clic, pas reproduire l'écran final.
export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-stone-500 animate-spin" />
    </div>
  );
}
