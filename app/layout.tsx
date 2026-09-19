import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Structure commune (charte graphique) : Fraunces pour les titres, Inter
// pour le corps de texte et l'UI — exposées comme variables CSS et
// remappées sur font-serif/font-sans dans globals.css, pour que les usages
// déjà existants de ces classes utilitaires (10 fichiers pour font-serif)
// récupèrent la police sans qu'aucun composant n'ait besoin d'être touché.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-voice",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LabTraiteur — Commande en ligne",
  description: "Plateforme de commande pour traiteurs",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`h-full antialiased ${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
