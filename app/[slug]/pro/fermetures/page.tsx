import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getUpcomingClosures } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { formatDateLabel, getTodayISO } from "@/lib/slots";
import { Button } from "@/components/ui/Button";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { AddClosureForm } from "./AddClosureForm";
import { removeClosure, updateClosedWeekdays } from "./actions";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

export default async function FermeturesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { session, context } = staffTenant;

  const today = getTodayISO();
  const closures = await runAsTenant(context, (tx) => getUpcomingClosures(tx, establishment.id, today));

  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const closedWeekdaySet = new Set(establishment.closedWeekdays);

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner
      active="fermetures"
    >
    <ProPanel>
      <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Fermetures — {establishment.name}</p>

      <div className="px-6 py-4 border-b border-stone-200">
        <p className="text-xs text-stone-400 mb-3">
          Fermeture hebdomadaire récurrente — ces jours ne seront jamais proposés au client, chaque semaine.
        </p>
        <form action={updateClosedWeekdays.bind(null, slug)} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            {WEEKDAY_OPTIONS.map((day) => (
              <label key={day.value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="closedWeekdays" value={day.value} defaultChecked={closedWeekdaySet.has(day.value)} />
                {day.label}
              </label>
            ))}
          </div>
          <Button type="submit" accentColor={accentColor} className="self-start">
            Enregistrer
          </Button>
        </form>
      </div>

      <div className="px-6 py-4 border-b border-stone-200">
        <p className="text-xs text-stone-400 mb-3">Fermetures ponctuelles — congés, jours fériés</p>
        <div className="flex flex-col divide-y divide-stone-100 mb-4">
          {closures.map((closure) => (
            <div key={closure.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium capitalize">{formatDateLabel(closure.date)}</p>
                {closure.reason && <p className="text-xs text-stone-400 mt-0.5">{closure.reason}</p>}
              </div>
              <form action={removeClosure.bind(null, slug, closure.id)}>
                <button type="submit" className="text-xs text-red-600 hover:text-red-800 underline whitespace-nowrap">
                  Supprimer
                </button>
              </form>
            </div>
          ))}
          {closures.length === 0 && <p className="py-4 text-center text-stone-400 text-sm">Aucune fermeture ponctuelle à venir.</p>}
        </div>
        <AddClosureForm slug={slug} accentColor={accentColor} />
      </div>
    </ProPanel>
    </ProShell>
  );
}
