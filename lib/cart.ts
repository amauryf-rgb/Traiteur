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

const EMPTY_CART: CartLine[] = [];

export function useCart(slug: string, type: OrderType) {
  const key = cartKey(slug, type);
  const items = useLocalJSON<CartLine[]>(key, EMPTY_CART);

  const setQuantity = useCallback(
    (product: { id: string; name: string; price: number }, quantity: number) => {
      const current = readJSON<CartLine[]>(key, EMPTY_CART);
      const next =
        quantity <= 0
          ? current.filter((line) => line.productId !== product.id)
          : current.some((line) => line.productId === product.id)
            ? current.map((line) => (line.productId === product.id ? { ...line, quantity } : line))
            : [...current, { productId: product.id, name: product.name, unitPrice: product.price, quantity }];
      writeJSON(key, next);
    },
    [key]
  );

  const clear = useCallback(() => writeJSON(key, []), [key]);

  const totalItems = items.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  return { items, setQuantity, clear, totalItems, totalAmount };
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
