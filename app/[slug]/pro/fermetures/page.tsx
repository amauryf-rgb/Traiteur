import { redirect } from "next/navigation";

// Fermetures a été regroupée avec Équipe et l'identité visuelle sous
// /pro/etablissement (onglets) — cette route reste en place uniquement pour
// ne pas casser un lien ou favori existant.
export default async function FermeturesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}/pro/etablissement?tab=fermetures`);
}
