"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { saveProduct, type ProductFormState } from "./actions";
import type { ManagedProduct } from "@/lib/db/queries";

const initialState: ProductFormState = {};

export function ProductForm({
  slug,
  product,
  allergenOptions,
  accentColor,
}: {
  slug: string;
  product: ManagedProduct | null;
  allergenOptions: { id: string; label: string }[];
  accentColor: string;
}) {
  const action = saveProduct.bind(null, slug, product?.id ?? null);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 px-6 py-6">
      <div>
        <label className="block text-xs text-stone-400 mb-1">Nom du produit</label>
        <input
          name="name"
          defaultValue={product?.name}
          required
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Prix (CHF)</label>
          <input
            name="priceAmount"
            type="number"
            step="0.05"
            min="0"
            defaultValue={product?.priceAmount}
            required
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Catégorie</label>
          <input
            name="categoryName"
            defaultValue={product?.categoryName ?? ""}
            placeholder="ex. Plats"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-stone-400 mb-1">Sous-titre de section (optionnel)</label>
        <input
          name="sectionTitle"
          defaultValue={product?.sectionTitle ?? ""}
          placeholder="ex. Pâtes fraîches"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <p className="text-xs text-stone-400 mt-1">
          Regroupe les produits partageant le même intitulé sous ce sous-titre dans le catalogue client, au sein de
          leur catégorie. Laisser vide pour ne pas regrouper.
        </p>
      </div>

      <div>
        <label className="block text-xs text-stone-400 mb-1">Description</label>
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 resize-none"
        />
      </div>

      {allergenOptions.length > 0 && (
        <div>
          <label className="block text-xs text-stone-400 mb-2">Allergènes</label>
          <div className="flex flex-wrap gap-3">
            {allergenOptions.map((allergen) => (
              <label key={allergen.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="allergenIds"
                  value={allergen.id}
                  defaultChecked={product?.allergenIds.includes(allergen.id) ?? false}
                />
                {allergen.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availableBoutique" defaultChecked={product?.availableBoutique ?? true} />
          Disponible en boutique
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availableTraiteur" defaultChecked={product?.availableTraiteur ?? true} />
          Disponible en commande traiteur
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} />
        Disponible à la vente
      </label>

      <div className="border-t border-stone-200 pt-4">
        <p className="text-xs text-stone-400 mb-2">Capacité de production (laisser vide = pas de limite)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Quantité max / jour</label>
            <input
              name="perDayMax"
              type="number"
              min="0"
              defaultValue={product?.perDayMax ?? ""}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Quantité max / créneau</label>
            <input
              name="perSlotMax"
              type="number"
              min="0"
              defaultValue={product?.perSlotMax ?? ""}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-stone-400 mb-1">Alerter à partir de (%)</label>
          <input
            name="alertThresholdPct"
            type="number"
            min="1"
            max="100"
            defaultValue={product?.alertThresholdPct ?? 80}
            className="w-28 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
        </div>
      </div>

      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending} accentColor={accentColor}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Link href={`/${slug}/pro/catalogue`} className={`${buttonClassName("secondary")} border-stone-200 text-stone-600 hover:border-stone-300`}>
          Annuler
        </Link>
      </div>
    </form>
  );
}
