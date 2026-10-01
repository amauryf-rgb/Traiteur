import { notFound } from "next/navigation";
import { getClosuresInRange } from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import {
  closureDatesForType,
  getClosedDatesInRange,
  getTodayISO,
  getTraiteurDates,
  getTraiteurTimes,
  getTraiteurWindowBounds,
} from "@/lib/slots";
import { WizardShell } from "../_components/WizardShell";
import { EvenementForm } from "./EvenementForm";

export default async function EvenementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getPublicTenantContext(slug);
  if (!tenant) notFound();
  const { establishment, context } = tenant;

  const today = getTodayISO();
  const { end: windowEnd } = getTraiteurWindowBounds();
  const closureRows = await runAsTenant(context, (tx) => getClosuresInRange(tx, establishment.id, today, windowEnd));
  const closedDates = getClosedDatesInRange(
    establishment.closedWeekdaysTraiteur,
    closureDatesForType(closureRows, "traiteur"),
    today,
    windowEnd
  );
  const dates = getTraiteurDates(closedDates);
  const times = getTraiteurTimes();
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <WizardShell establishment={{ name: establishment.name, logoUrl: establishment.logoUrl }} step={1} accentColor={accentColor}>
      <EvenementForm
        slug={slug}
        dates={dates}
        times={times}
        accentColor={accentColor}
        deliveryFeeDefault={establishment.deliveryFeeDefault}
      />
    </WizardShell>
  );
}
