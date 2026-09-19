"use client";

import { useState } from "react";
import { formatCHF } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { generateInvoice } from "./actions";

type Row = { orderId: string; clientName: string; pickupDate: string; totalAmount: number };

export function InvoiceGroupForm({
  slug,
  fromEntityId,
  toEntityId,
  fromName,
  toName,
  periodStart,
  periodEnd,
  orders,
  accentColor,
}: {
  slug: string;
  fromEntityId: string;
  toEntityId: string;
  fromName: string;
  toName: string;
  periodStart: string;
  periodEnd: string;
  orders: Row[];
  accentColor: string;
}) {
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(orders.map((o) => [o.orderId, true]))
  );
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(orders.map((o) => [o.orderId, o.totalAmount]))
  );

  const total = orders.reduce((sum, o) => sum + (included[o.orderId] ? amounts[o.orderId] : 0), 0);
  const action = generateInvoice.bind(null, slug);

  return (
    <form action={action} className="border border-stone-200 rounded-lg p-4 mb-4">
      <input type="hidden" name="fromEntityId" value={fromEntityId} />
      <input type="hidden" name="toEntityId" value={toEntityId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />

      <p className="text-sm font-medium mb-3">
        {fromName} → {toName}
      </p>

      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div key={order.orderId} className="flex items-center gap-3 text-sm">
            <input type="hidden" name="orderIds" value={order.orderId} />
            <input
              type="checkbox"
              name="included"
              value={order.orderId}
              checked={included[order.orderId]}
              onChange={(e) => setIncluded((prev) => ({ ...prev, [order.orderId]: e.target.checked }))}
            />
            <span className="flex-1 text-stone-600 truncate">
              {order.clientName} · {order.pickupDate}
            </span>
            <input
              type="number"
              step="0.05"
              name={`amount_${order.orderId}`}
              value={amounts[order.orderId]}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [order.orderId]: Number(e.target.value) }))}
              className="w-24 border border-stone-200 rounded-md px-2 py-1 text-xs text-right"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-stone-200">
        <p className="text-sm font-medium">Total : {formatCHF(total)}</p>
        <Button type="submit" accentColor={accentColor}>
          Générer la facture
        </Button>
      </div>
    </form>
  );
}
