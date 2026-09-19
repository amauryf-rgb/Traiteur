"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { addStaffMember, type StaffFormState } from "./actions";

const initialState: StaffFormState = {};

export function AddStaffForm({
  slug,
  entities,
  accentColor,
}: {
  slug: string;
  entities: { id: string; name: string }[];
  accentColor: string;
}) {
  const action = addStaffMember.bind(null, slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="name"
        placeholder="Nom"
        required
        className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
      />
      <div className="flex gap-3">
        <select name="role" defaultValue="employee" className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="employee">Employé</option>
          <option value="manager">Manager</option>
          <option value="owner">Propriétaire</option>
        </select>
        <select name="legalEntityId" className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm">
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
      <Button type="submit" disabled={isPending} accentColor={accentColor}>
        {isPending ? "Ajout…" : "Ajouter"}
      </Button>
    </form>
  );
}
