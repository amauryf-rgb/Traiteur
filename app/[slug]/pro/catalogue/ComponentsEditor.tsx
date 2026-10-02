"use client";

import { useState } from "react";
import type { ProductComponentWithOptions } from "@/lib/db/queries";

type EditableOption = { label: string; isDefault: boolean };
type EditableComponent = { label: string; type: "include" | "choice"; options: EditableOption[] };

function toEditable(components: ProductComponentWithOptions[]): EditableComponent[] {
  return components.map((c) => ({
    label: c.label,
    type: c.type,
    options: c.options.map((o) => ({ label: o.label, isDefault: o.isDefault })),
  }));
}

// Éditeur des "composants substituables" d'une formule (ex. "Entrée au choix
// parmi 3") — entièrement optionnel, une formule sans composant garde son
// affichage actuel (description en texte libre uniquement). Jamais utilisé
// pour le choix avec/sans dessert, qui reste géré séparément (champ "Prix
// sans dessert" plus haut dans ce formulaire) : un composant n'existe que
// pour une alternative que le pro a explicitement prévue.
//
// Sérialisé en JSON dans un champ caché plutôt qu'en noms de champs indexés
// (component_0_label, component_0_option_0_label…) : la structure est
// imbriquée sur deux niveaux, un simple JSON.stringify/parse est plus direct
// à lire et à valider côté serveur (voir parseComponentsInput, actions.ts)
// qu'une reconstruction depuis des clés FormData indexées.
export function ComponentsEditor({
  initialComponents,
  accentColor,
}: {
  initialComponents: ProductComponentWithOptions[];
  accentColor: string;
}) {
  const [components, setComponents] = useState<EditableComponent[]>(() => toEditable(initialComponents));

  function addComponent() {
    setComponents((prev) => [...prev, { label: "", type: "choice", options: [{ label: "", isDefault: true }] }]);
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  function updateComponentLabel(index: number, label: string) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, label } : c)));
  }

  function updateComponentType(index: number, type: "include" | "choice") {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, type, options: type === "include" ? [] : c.options } : c))
    );
  }

  function addOption(componentIndex: number) {
    setComponents((prev) =>
      prev.map((c, i) => (i === componentIndex ? { ...c, options: [...c.options, { label: "", isDefault: c.options.length === 0 }] } : c))
    );
  }

  function removeOption(componentIndex: number, optionIndex: number) {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== componentIndex) return c;
        const options = c.options.filter((_, j) => j !== optionIndex);
        // Si l'option par défaut vient d'être retirée, en désigner une autre
        // pour qu'il en reste toujours une — évite un composant sans valeur
        // pré-sélectionnée côté client.
        if (options.length > 0 && !options.some((o) => o.isDefault)) options[0].isDefault = true;
        return { ...c, options };
      })
    );
  }

  function updateOptionLabel(componentIndex: number, optionIndex: number, label: string) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === componentIndex ? { ...c, options: c.options.map((o, j) => (j === optionIndex ? { ...o, label } : o)) } : c
      )
    );
  }

  function setDefaultOption(componentIndex: number, optionIndex: number) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === componentIndex ? { ...c, options: c.options.map((o, j) => ({ ...o, isDefault: j === optionIndex })) } : c
      )
    );
  }

  return (
    <div>
      <input type="hidden" name="componentsJson" value={JSON.stringify(components)} readOnly />
      <label className="block text-xs text-ink-muted mb-1">Composants substituables (optionnel)</label>
      <p className="text-xs text-ink-muted mb-3">
        Pour un plat où le client choisit une alternative (ex. &laquo;&nbsp;Entrée au choix&nbsp;&raquo;). Laisser vide
        si la formule n&apos;a pas d&apos;alternative prévue — elle garde alors sa description telle quelle.
      </p>

      <div className="flex flex-col gap-4">
        {components.map((component, ci) => (
          <div key={ci} className="border border-stone-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <input
                value={component.label}
                onChange={(e) => updateComponentLabel(ci, e.target.value)}
                placeholder={component.type === "include" ? "ex. Antipasti à l'italienne" : "ex. Entrée"}
                className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-stone-400"
              />
              <button
                type="button"
                onClick={() => removeComponent(ci)}
                className="text-xs text-red-700 shrink-0"
                aria-label={`Retirer le composant ${component.label || ci + 1}`}
              >
                Retirer
              </button>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => updateComponentType(ci, "include")}
                className="text-xs rounded-full border px-2.5 py-1"
                style={
                  component.type === "include"
                    ? { borderColor: accentColor, color: accentColor, backgroundColor: `${accentColor}12` }
                    : { borderColor: "#e7e5e4", color: "#78716c" }
                }
              >
                Élément inclus (décochable)
              </button>
              <button
                type="button"
                onClick={() => updateComponentType(ci, "choice")}
                className="text-xs rounded-full border px-2.5 py-1"
                style={
                  component.type === "choice"
                    ? { borderColor: accentColor, color: accentColor, backgroundColor: `${accentColor}12` }
                    : { borderColor: "#e7e5e4", color: "#78716c" }
                }
              >
                Choix parmi plusieurs options
              </button>
            </div>

            {component.type === "choice" && (
            <div className="flex flex-col gap-1.5 mt-2.5 pl-1">
              {component.options.map((option, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`component-${ci}-default`}
                    checked={option.isDefault}
                    onChange={() => setDefaultOption(ci, oi)}
                    aria-label={`${option.label || "Cette option"} incluse par défaut`}
                  />
                  <input
                    value={option.label}
                    onChange={(e) => updateOptionLabel(ci, oi, e.target.value)}
                    placeholder="ex. Antipasti à l'italienne"
                    className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(ci, oi)}
                    className="text-xs text-ink-muted shrink-0"
                    aria-label={`Retirer l'alternative ${option.label || oi + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(ci)} className="text-xs text-left mt-1" style={{ color: accentColor }}>
                + Ajouter une alternative
              </button>
            </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addComponent} className="text-xs underline underline-offset-2 mt-3" style={{ color: accentColor }}>
        + Ajouter un composant
      </button>
    </div>
  );
}
