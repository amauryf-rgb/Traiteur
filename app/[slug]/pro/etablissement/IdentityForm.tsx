"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateEstablishmentIdentity, type IdentityFormState } from "./actions";

const initialState: IdentityFormState = {};

function ImageField({
  label,
  hint,
  name,
  removeName,
  currentUrl,
  previewClassName,
}: {
  label: string;
  hint: string;
  name: string;
  removeName: string;
  currentUrl: string | null;
  previewClassName: string;
}) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [remove, setRemove] = useState(false);

  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1">{label}</label>
      <p className="text-xs text-ink-muted mb-2">{hint}</p>
      <div className="flex items-center gap-4">
        {preview && !remove ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className={`${previewClassName} object-cover rounded-lg border border-stone-200 bg-stone-50`} />
        ) : (
          <div className={`${previewClassName} rounded-lg border border-dashed border-stone-300 flex items-center justify-center text-stone-300 text-xs shrink-0`}>
            Aucune
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <input
            name={name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPreview(URL.createObjectURL(file));
                setRemove(false);
              }
            }}
            className="text-xs text-ink-muted"
          />
          {currentUrl && (
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                name={removeName}
                checked={remove}
                onChange={(e) => {
                  setRemove(e.target.checked);
                  if (e.target.checked) setPreview(null);
                }}
              />
              Supprimer l&apos;image actuelle
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

export function IdentityForm({
  slug,
  logoUrl,
  bannerUrl,
  deliveryFeeDefault,
  accentColor,
}: {
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  deliveryFeeDefault: string | null;
  accentColor: string;
}) {
  const action = updateEstablishmentIdentity.bind(null, slug, logoUrl, bannerUrl);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6 px-6 py-6">
      <ImageField
        label="Logo"
        hint="Affiché en haut du catalogue client à la place du nom, sur fond noir."
        name="logo"
        removeName="removeLogo"
        currentUrl={logoUrl}
        previewClassName="w-20 h-20"
      />
      <ImageField
        label="Bandeau photo"
        hint="Affiché en fond de l'écran d'accueil (choix boutique/traiteur) — une photo de l'établissement, des plats, de la terrasse…"
        name="banner"
        removeName="removeBanner"
        currentUrl={bannerUrl}
        previewClassName="w-32 h-16"
      />

      <div>
        <label className="block text-xs text-ink-muted mb-1">Frais de livraison (traiteur)</label>
        <p className="text-xs text-ink-muted mb-2">
          Forfait unique ajouté à la commande quand le client choisit la livraison plutôt que le retrait. Laisser vide
          tant que la livraison n&apos;est pas proposée.
        </p>
        <div className="flex items-center gap-2">
          <input
            name="deliveryFeeDefault"
            type="number"
            step="0.05"
            min="0"
            defaultValue={deliveryFeeDefault ?? ""}
            placeholder="ex. 25.00"
            className="w-32 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
          <span className="text-sm text-ink-muted">CHF</span>
        </div>
      </div>

      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}

      <Button type="submit" disabled={isPending} accentColor={accentColor} className="self-start">
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
