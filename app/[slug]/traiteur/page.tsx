import { redirect } from "next/navigation";

// Point d'entrée du tunnel de commande traiteur — toujours l'étape 1 en
// premier, pas de reprise à une étape intermédiaire pour l'instant (chaque
// étape vérifie elle-même si les précédentes sont complètes, voir
// isEventStepComplete côté étape 2).
export default async function TraiteurWizardEntry({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}/traiteur/evenement`);
}
