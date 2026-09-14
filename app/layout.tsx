import type { Metadata } from "next";
import "./globals.css";

// Note : Geist (Google Fonts) retiré temporairement car ce sandbox de
// développement n'a pas accès à fonts.googleapis.com. Fonctionne
// normalement sur une machine avec accès internet standard — à remettre
// si souhaité, ou choisir une police auto-hébergée via next/font/local.

export const metadata: Metadata = {
  title: "LabTraiteur — Commande en ligne",
  description: "Plateforme de commande pour traiteurs",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
