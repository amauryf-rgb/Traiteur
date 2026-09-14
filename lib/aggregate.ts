import type { OrderWithItems } from "./db/queries";

export type ProductAggregate = { productId: string; name: string; quantity: number };

export function aggregateByProduct(orders: OrderWithItems[]): ProductAggregate[] {
  const map = new Map<string, ProductAggregate>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const item of order.items) {
      const entry = map.get(item.productId) ?? { productId: item.productId, name: item.productNameSnapshot, quantity: 0 };
      entry.quantity += item.quantity;
      map.set(item.productId, entry);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}
