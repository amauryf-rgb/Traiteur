export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  // undefined = produit sans option dessert. true/false = choix fait pour
  // cette ligne (voir MenuRow) — le prix affiché/unitPrice en tient déjà
  // compte, ce champ ne sert qu'à transmettre le choix au serveur, qui
  // recalcule lui-même le prix final depuis la base (jamais celui du client).
  withDessert?: boolean;
};

export type OrderType = "boutique" | "traiteur";

export type CheckoutState = {
  reservationIds: string[];
  expiresAt: string;
  date: string;
  time: string;
  items: CartLine[];
};
