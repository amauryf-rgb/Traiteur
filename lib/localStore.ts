"use client";

import { useSyncExternalStore } from "react";

// Petit magasin externe générique au-dessus de localStorage, exposé via
// useSyncExternalStore plutôt qu'un useEffect + setState — évite le
// rendu "vide puis rempli" et reste synchronisé entre onglets.
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

// Repli en mémoire quand localStorage est bloqué (ex. Safari en navigation
// privée : setItem lève systématiquement). Sans ce repli, writeJSON échouait
// silencieusement et l'UI ne reflétait jamais la nouvelle valeur — le panier
// semblait ne réagir à aucun clic.
const memoryStore = new Map<string, unknown>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

export function readJSON<T>(key: string, fallback: T): T {
  if (memoryStore.has(key)) return memoryStore.get(key) as T;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function writeJSON(key: string, value: unknown) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée, quota) — memoryStore fait
    // office de source de vérité pour le reste de la session
  }
  notify();
}

export function removeKeys(keys: string[]) {
  for (const key of keys) memoryStore.delete(key);
  try {
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // rien de plus à faire si le stockage est indisponible
  }
  notify();
}

function noopSubscribe() {
  return () => {};
}

// Vrai uniquement après l'hydratation côté client — évite d'agir sur une
// valeur "serveur" transitoire (ex. rediriger avant que useLocalJSON n'ait
// eu la chance de se resynchroniser sur le vrai contenu du localStorage).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function useLocalJSON<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => readJSON(key, fallback),
    () => fallback
  );
}
