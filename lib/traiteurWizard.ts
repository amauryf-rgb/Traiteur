"use client";

import { useCallback } from "react";
import { readJSON, writeJSON, useLocalJSON, removeKeys } from "./localStore";
import type { CatalogueProduct } from "./db/queries";

export type DeliveryMode = "pickup" | "delivery";

// Brouillon de l'étape 1 (Événement) du tunnel de commande traiteur — distinct
// du panier historique (lib/cart.ts), qui reste utilisé tel quel par la
// Boutique uniquement. pickupTime n'a de sens que si deliveryMode==="pickup" ;
// deliveryAddress uniquement si deliveryMode==="delivery" — les deux champs
// coexistent dans le brouillon pour ne pas perdre la saisie si le client
// bascule l'un puis l'autre avant de valider.
export type WizardEventDraft = {
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  guestCount: number;
  deliveryMode: DeliveryMode;
  pickupTime: string;
  deliveryAddress: string;
};

const EMPTY_EVENT: WizardEventDraft = {
  eventDate: "",
  eventTime: "",
  eventLocation: "",
  guestCount: 1,
  deliveryMode: "pickup",
  pickupTime: "",
  deliveryAddress: "",
};

function eventKey(slug: string) {
  return `traiteurWizard:event:${slug}`;
}

export function useWizardEvent(slug: string) {
  const key = eventKey(slug);
  const event = useLocalJSON<WizardEventDraft>(key, EMPTY_EVENT);

  const setEvent = useCallback(
    (patch: Partial<WizardEventDraft>) => {
      const current = readJSON<WizardEventDraft>(key, EMPTY_EVENT);
      writeJSON(key, { ...current, ...patch });
    },
    [key]
  );

  return { event, setEvent };
}

export function isEventStepComplete(event: WizardEventDraft): boolean {
  if (!event.eventDate || !event.eventTime || !event.eventLocation.trim() || event.guestCount < 1) return false;
  if (event.deliveryMode === "pickup") return event.pickupTime !== "";
  return event.deliveryAddress.trim() !== "";
}

// Une formule ajoutée à l'étape 2 — selections mappe componentId -> l'id de
// l'option choisie (voir product_components/product_component_options),
// vide si la formule n'a aucun composant substituable configuré. withDessert
// undefined = formule sans option dessert (priceAmountNoDessert absent) ;
// toujours présent (true/false) sinon, jamais une troisième option "pas
// encore choisi" : la case est cochée par défaut à l'ajout, voir MenuRow pour
// le même choix fait sur l'ancien catalogue.
export type WizardFormulaLine = {
  productId: string;
  quantity: number;
  withDessert?: boolean;
  selections: Record<string, string>;
  // Ids des components de type 'include' que le client a décochés (voir
  // product_components.type) — vide par défaut, tout est inclus tant que
  // rien n'y figure. Jamais de recalcul de prix associé, voir
  // order_item_exclusions.
  excludedComponentIds: string[];
  customerNote: string;
};

function formulasKey(slug: string) {
  return `traiteurWizard:formulas:${slug}`;
}

const EMPTY_FORMULAS: WizardFormulaLine[] = [];

function defaultSelections(product: CatalogueProduct): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const component of product.components) {
    const defaultOption = component.options.find((o) => o.isDefault) ?? component.options[0];
    if (defaultOption) selections[component.id] = defaultOption.id;
  }
  return selections;
}

export function useWizardFormulas(slug: string) {
  const key = formulasKey(slug);
  const formulas = useLocalJSON<WizardFormulaLine[]>(key, EMPTY_FORMULAS);

  const addFormula = useCallback(
    (product: CatalogueProduct, quantity: number) => {
      const current = readJSON<WizardFormulaLine[]>(key, EMPTY_FORMULAS);
      if (current.some((f) => f.productId === product.id)) return;
      const line: WizardFormulaLine = {
        productId: product.id,
        quantity: Math.max(1, quantity),
        withDessert: product.priceAmountNoDessert != null ? true : undefined,
        selections: defaultSelections(product),
        excludedComponentIds: [],
        customerNote: "",
      };
      writeJSON(key, [...current, line]);
    },
    [key]
  );

  const updateFormula = useCallback(
    (productId: string, patch: Partial<WizardFormulaLine>) => {
      const current = readJSON<WizardFormulaLine[]>(key, EMPTY_FORMULAS);
      writeJSON(
        key,
        current.map((f) => (f.productId === productId ? { ...f, ...patch } : f))
      );
    },
    [key]
  );

  const removeFormula = useCallback(
    (productId: string) => {
      const current = readJSON<WizardFormulaLine[]>(key, EMPTY_FORMULAS);
      writeJSON(
        key,
        current.filter((f) => f.productId !== productId)
      );
    },
    [key]
  );

  const totalAllocated = formulas.reduce((sum, f) => sum + f.quantity, 0);

  return { formulas, addFormula, updateFormula, removeFormula, totalAllocated };
}

// Coordonnées client de l'étape 3 — mêmes champs que order_contacts (voir
// lib/db/schema.ts), persistés dans order_contacts et, si le client est
// connecté, réécrits sur clients à la soumission finale (étape 4) pour
// pré-remplir la prochaine commande. Ce fichier ne s'occupe que du
// brouillon local : aucune écriture en base avant la validation du tunnel.
export type WizardContactDraft = {
  name: string;
  email: string;
  email2: string;
  phone: string;
  contactAddressLine1: string;
  contactAddressLine2: string;
  contactAddressPostalCode: string;
  contactAddressCity: string;
  billingSameAsContact: boolean;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingAddressPostalCode: string;
  billingAddressCity: string;
};

const EMPTY_CONTACT: WizardContactDraft = {
  name: "",
  email: "",
  email2: "",
  phone: "",
  contactAddressLine1: "",
  contactAddressLine2: "",
  contactAddressPostalCode: "",
  contactAddressCity: "",
  billingSameAsContact: true,
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingAddressPostalCode: "",
  billingAddressCity: "",
};

function contactKey(slug: string) {
  return `traiteurWizard:contact:${slug}`;
}

export function useWizardContact(slug: string) {
  const key = contactKey(slug);
  const contact = useLocalJSON<WizardContactDraft>(key, EMPTY_CONTACT);

  const setContact = useCallback(
    (patch: Partial<WizardContactDraft>) => {
      const current = readJSON<WizardContactDraft>(key, EMPTY_CONTACT);
      writeJSON(key, { ...current, ...patch });
    },
    [key]
  );

  return { contact, setContact };
}

// Appelé une fois la demande de devis soumise avec succès (étape 4) — le
// client peut relancer un nouveau tunnel sans retomber sur les anciennes
// valeurs. Les trois clés voyagent toujours ensemble (un seul tunnel actif
// par établissement/navigateur à la fois).
export function clearWizardDraft(slug: string) {
  removeKeys([eventKey(slug), formulasKey(slug), contactKey(slug)]);
}

export function isContactStepComplete(contact: WizardContactDraft): boolean {
  if (!contact.name.trim() || !contact.email.trim() || !contact.phone.trim()) return false;
  if (!contact.contactAddressLine1.trim() || !contact.contactAddressPostalCode.trim() || !contact.contactAddressCity.trim()) return false;
  if (!contact.billingSameAsContact) {
    if (!contact.billingAddressLine1.trim() || !contact.billingAddressPostalCode.trim() || !contact.billingAddressCity.trim()) return false;
  }
  return true;
}
