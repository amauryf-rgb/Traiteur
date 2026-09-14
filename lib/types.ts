export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type OrderType = "boutique" | "traiteur";

export type CheckoutState = {
  reservationIds: string[];
  expiresAt: string;
  date: string;
  time: string;
  items: CartLine[];
};
