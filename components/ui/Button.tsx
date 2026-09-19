import type { ButtonHTMLAttributes, CSSProperties } from "react";

type Variant = "primary" | "secondary";

// Couleur d'accent : personnalisation par établissement, inchangée dans son
// mécanisme (prop lue depuis establishment.accentColor, comme partout
// ailleurs dans le code) — ce composant ne fait qu'unifier la forme
// (arrondi, tailles, états) autour de ce même mécanisme, pas le remplacer.
const DEFAULT_ACCENT = "#1a1a1a";

export function buttonClassName(variant: Variant = "primary"): string {
  const base = "inline-flex items-center justify-center rounded-lg text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  return variant === "primary" ? base : `${base} border-2 bg-transparent`;
}

export function buttonStyle(variant: Variant, accentColor: string | null): CSSProperties {
  const accent = accentColor ?? DEFAULT_ACCENT;
  return variant === "primary" ? { backgroundColor: accent, color: "white" } : { borderColor: accent, color: accent };
}

export function Button({
  variant = "primary",
  accentColor,
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; accentColor: string | null }) {
  return (
    <button
      className={`${buttonClassName(variant)} ${className}`}
      style={{ ...buttonStyle(variant, accentColor), ...style }}
      {...props}
    />
  );
}
