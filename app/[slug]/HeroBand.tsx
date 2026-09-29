// Bandeau photo de l'écran de choix (boutique/traiteur) — propre à cet écran,
// ne remplace pas IdentityHeader qui reste utilisé par /pro/login,
// /compte/login, /compte/signup et l'écran "Fermé aujourd'hui" (hors
// périmètre de ce chantier). Sans bannerUrl configuré (pas encore de flux
// d'upload dédié), repli sur un fond sombre uni : même dégradé, même texte en
// overlay, juste sans photo — jamais de bandeau cassé ou vide.
export function HeroBand({
  name,
  line,
  bannerUrl,
  corner,
}: {
  name: string;
  line: string;
  bannerUrl?: string | null;
  corner: React.ReactNode;
}) {
  return (
    <div
      className="relative h-[200px] bg-cover bg-[center_62%]"
      style={{
        backgroundColor: "#1f1310",
        backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(31,19,16,0.10) 0%, rgba(31,19,16,0.78) 100%)" }}
      />
      <div className="absolute top-4 right-[18px] z-10 text-xs text-[#f7f3ec]">{corner}</div>
      <div className="absolute left-0 right-0 bottom-4 z-10 text-center px-4">
        <h1 className="font-serif font-medium text-2xl text-[#f7f3ec]">{name}</h1>
        <p className="font-serif italic text-sm text-[#e8ddd6] mt-1">{line}</p>
      </div>
    </div>
  );
}
