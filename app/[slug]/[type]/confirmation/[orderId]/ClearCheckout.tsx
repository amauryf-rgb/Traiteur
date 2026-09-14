"use client";

import { useEffect } from "react";
import { clearCheckout } from "@/lib/cart";
import type { OrderType } from "@/lib/types";

export function ClearCheckout({ slug, orderType }: { slug: string; orderType: OrderType }) {
  useEffect(() => {
    clearCheckout(slug, orderType);
  }, [slug, orderType]);

  return null;
}
