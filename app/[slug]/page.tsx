import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { IdentityHeader, ScreenCard } from "@/components/headers";

const UNIVERSES = [
  {
    type: "boutique" as const,
    title: "Boutique du jour",
    description: "Plats et produits disponibles aujourd'hui, à retirer dans l'heure. Paiement immédiat.",
  },
  {
    type: "traiteur" as const,
    title: "Commande traiteur",
    description: "Pour un événement ou une réception, à commander à l'avance. Acompte à la commande, solde au retrait.",
  },
];

export default async function EstablishmentEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  return (
    <ScreenCard>
      <IdentityHeader establishment={establishment} line="Que souhaitez-vous faire ?" />
      <div className="px-6 pb-6 flex flex-col gap-4 border-t border-stone-200 pt-6">
        {UNIVERSES.map((universe) => (
          <Link
            key={universe.type}
            href={`/${slug}/${universe.type}`}
            className="block rounded-xl border border-stone-200 px-5 py-4 hover:border-stone-300 transition-colors"
          >
            <div className="flex justify-between items-baseline gap-3">
              <p className="font-serif text-base">{universe.title}</p>
              <span className="text-stone-400">→</span>
            </div>
            <p className="text-sm text-stone-500 mt-1">{universe.description}</p>
          </Link>
        ))}
      </div>
    </ScreenCard>
  );
}
