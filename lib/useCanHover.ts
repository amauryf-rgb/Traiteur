"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// Rendu serveur : pas de fenêtre, donc pas de survol tant que l'hydratation
// n'a pas eu lieu — useSyncExternalStore gère la resynchronisation ensuite
// sans le mismatch d'hydratation qu'un useState+useEffect classique
// provoquerait ici (voir la règle react-hooks/set-state-in-effect).
function getServerSnapshot() {
  return false;
}

// Détection capacité (survol + pointeur précis), jamais un breakpoint de
// largeur — un grand écran tactile (tablette, écran tactile de bureau) doit
// recevoir le comportement tactile (accordéon), pas le survol, même s'il est
// large. Se resynchronise si l'appareil change de capacité (souris branchée
// sur une tablette, par exemple).
export function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
