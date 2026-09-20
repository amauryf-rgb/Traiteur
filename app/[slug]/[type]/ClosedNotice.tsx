import Link from "next/link";
import { IdentityHeader, ScreenCard } from "@/components/headers";
import { buttonClassName } from "@/components/ui/Button";

type Establishment = { name: string; tagline: string | null; accentColor: string | null; logoUrl?: string | null };

export function ClosedNotice({ establishment, reason, slug }: { establishment: Establishment; reason: string | null; slug: string }) {
  return (
    <ScreenCard>
      <IdentityHeader establishment={establishment} line="Fermé aujourd'hui" />
      <div className="px-6 pb-6 border-t border-stone-200 pt-6 text-center">
        <p className="text-sm text-stone-500">
          {reason ?? "La boutique n'assure pas de retrait aujourd'hui. Revenez lors d'un prochain jour d'ouverture."}
        </p>
        <Link href={`/${slug}`} className={`${buttonClassName("secondary")} mt-6 border-stone-200 text-stone-600 hover:border-stone-300`}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </ScreenCard>
  );
}
