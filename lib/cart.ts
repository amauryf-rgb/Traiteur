"use client";

import { useCallback } from "react";
import { readJSON, removeKeys, useLocalJSON, writeJSON } from "./localStore";
import type { CartLine, CheckoutState, OrderType } from "./types";

function cartKey(slug: string, type: OrderType) {
  return `cart:${slug}:${type}`;
}

function checkoutKey(slug: string, type: OrderType) {
  return `checkout:${slug}:${type}`;
}

function guestCountKey(slug: string, type: OrderType) {
  return `guestCount:${slug}:${type}`;
}

const EMPTY_CART: CartLine[] = [];

export function useCart(slug: string, type: OrderType) {
  const key = cartKey(slug, type);
  const items = useLocalJSON<CartLine[]>(key, EMPTY_CART);

  const setQuantity = useCallback(
    (product: { id: string; name: string; price: number; withDessert?: boolean }, quantity: number) => {
      const current = readJSON<CartLine[]>(key, EMPTY_CART);
      const next =
        quantity <= 0
          ? current.filter((line) => line.productId !== product.id)
          : current.some((line) => line.productId === product.id)
            ? current.map((line) =>
                line.productId === product.id ? { ...line, quantity, unitPrice: product.price, withDessert: product.withDessert } : line
              )
            : [
                ...current,
                { productId: product.id, name: product.name, unitPrice: product.price, quantity, withDessert: product.withDessert },
              ];
      writeJSON(key, next);
    },
    [key]
  );

  const clear = useCallback(() => writeJSON(key, []), [key]);

  const totalItems = items.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  return { items, setQuantity, clear, totalItems, totalAmount };
}

// Nombre de personnes — un seul chiffre pour toute la commande (pas par
// formule) : les prix du catalogue traiteur sont par personne, ce nombre
// fixe la quantité de chaque formule déjà au panier et sert de valeur de
// départ quand on en ajoute une nouvelle (voir MenuRow/CatalogueClient).
export function useGuestCount(slug: string, type: OrderType) {
  const key = guestCountKey(slug, type);
  const guestCount = useLocalJSON<number>(key, 1);

  const setGuestCount = useCallback(
    (count: number) => {
      const next = Math.max(1, Math.floor(count) || 1);
      writeJSON(key, next);

      // Répercute immédiatement sur toutes les lignes déjà au panier — pas
      // besoin de rouvrir chaque formule pour ajuster sa quantité à la main.
      const cartLines = readJSON<CartLine[]>(cartKey(slug, type), EMPTY_CART);
      if (cartLines.length > 0) {
        writeJSON(
          cartKey(slug, type),
          cartLines.map((line) => ({ ...line, quantity: next }))
        );
      }
    },
    [key, slug, type]
  );

  return { guestCount, setGuestCount };
}

export function saveCheckoutState(slug: string, type: OrderType, state: CheckoutState) {
  writeJSON(checkoutKey(slug, type), state);
}

export function useCheckoutState(slug: string, type: OrderType): CheckoutState | null {
  return useLocalJSON<CheckoutState | null>(checkoutKey(slug, type), null);
}

export function clearCheckout(slug: string, type: OrderType) {
  removeKeys([checkoutKey(slug, type), cartKey(slug, type)]);
}
