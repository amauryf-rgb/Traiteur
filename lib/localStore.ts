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

const cache = new Map<string, { raw: string | null; value: unknown }>();

export function readJSON<T>(key: string, fallback: T): T {
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
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée, quota) — les listeners sont
    // tout de même notifiés pour que l'UI reflète la valeur en mémoire
  }
  notify();
}

export function removeKeys(keys: string[]) {
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
