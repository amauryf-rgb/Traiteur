"use client";

import { useState } from "react";

export type EtablissementTabKey = "identite" | "entites" | "equipe" | "fermetures";

const TABS: { key: EtablissementTabKey; label: string }[] = [
  { key: "identite", label: "Identité visuelle" },
  { key: "entites", label: "Entités juridiques" },
  { key: "equipe", label: "Équipe" },
  { key: "fermetures", label: "Fermetures" },
];

// Onglets côté client — tout le contenu de chaque section est déjà rendu
// côté serveur (staff, fermetures, formulaires) et passé en children ; ce
// composant ne fait que choisir lequel afficher, sans re-fetch ni re-render
// des sections inactives.
export function EtablissementTabs({
  initialTab,
  accentColor,
  sections,
}: {
  initialTab: EtablissementTabKey;
  accentColor: string;
  sections: Record<EtablissementTabKey, React.ReactNode>;
}) {
  const [active, setActive] = useState<EtablissementTabKey>(initialTab);

  return (
    <>
      <div className="flex gap-6 px-6 border-b border-stone-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className="py-3 text-sm whitespace-nowrap"
            style={
              active === tab.key
                ? { borderBottom: `2px solid ${accentColor}`, color: accentColor, fontWeight: 500, marginBottom: "-1px" }
                : { color: "#78716c" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      {sections[active]}
    </>
  );
}
