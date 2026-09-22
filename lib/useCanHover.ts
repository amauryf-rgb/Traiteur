"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

// État partagé par toutes les lignes (un seul écouteur mousemove pour toute
// la page, pas un par ligne) — voir ensureInit ci-dessous pour le filet de
// sécurité multi-navigateurs.
let cached = false;
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const mql = window.matchMedia(QUERY);
  cached = mql.matches;
  mql.addEventListener("change", (e) => {
    if (e.matches && !cached) {
      cached = true;
      notify();
    }
  });

  // Filet de sécurité : constaté en usage réel, Safari ne rapporte pas
  // toujours fidèlement (hover: hover) et (pointer: fine) selon la
  // configuration souris/trackpad — la ligne se retrouvait coincée en mode
  // tactile (bouton "+" caché) sur un vrai ordinateur avec une vraie souris.
  // Un mousemove authentique ne peut pas venir d'un appareil purement
  // tactile, donc on l'utilise comme signal définitif — une fois vrai,
  // toujours vrai (jamais de retour en arrière), sans jamais activer le
  // survol pour un appareil réellement tactile qui ne l'aura simplement
  // jamais déclenché.
  window.addEventListener(
    "mousemove",
    () => {
      if (!cached) {
        cached = true;
        notify();
      }
    },
    { once: true }
  );
}

function subscribe(callback: () => void) {
  ensureInit();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  ensureInit();
  return cached;
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
// large.
export function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
