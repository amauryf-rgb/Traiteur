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
  // Un vrai déplacement de souris est un signal définitif — une fois vrai,
  // toujours vrai (jamais de retour en arrière).
  //
  // IMPORTANT : on écoute "pointermove" avec pointerType "mouse", pas
  // "mousemove" — les navigateurs mobiles émettent un mousemove de
  // compatibilité juste après un tap tactile (pour les sites écrits pour la
  // souris), ce qui déclenchait ce filet à tort sur mobile et coinçait
  // définitivement toute la page en mode survol (bouton "+" et photo en
  // tooltip positionné hors écran au lieu de l'accordéon tactile). Un tap
  // tactile ne génère jamais de pointermove avec pointerType "mouse" — seul
  // un vrai mouvement de souris/trackpad le fait.
  function onPointerMove(e: PointerEvent) {
    if (!cached && e.pointerType === "mouse") {
      cached = true;
      notify();
      window.removeEventListener("pointermove", onPointerMove);
    }
  }
  window.addEventListener("pointermove", onPointerMove);
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
