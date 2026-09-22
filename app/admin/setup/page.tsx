import { redirect } from "next/navigation";
import { getPlatformAdminCount } from "@/lib/db/queries";
import { SetupForm } from "./SetupForm";

// Pas de segment dynamique dans cette route (contrairement à app/[slug]/**,
// dynamique par construction) : sans cette directive, Next.js la
// prérendrait statiquement au build, figeant pour toujours le résultat de
// getPlatformAdminCount() tel qu'il était à ce moment-là — inacceptable
// pour une page dont le comportement doit changer dès qu'un compte existe.
export const dynamic = "force-dynamic";

// À usage unique : dès qu'un compte platform_admin existe, cette page ne
// se rend plus jamais — voir app/admin/setup/actions.ts pour le même
// contrôle côté écriture.
export default async function AdminSetupPage() {
  const existing = await getPlatformAdminCount();
  if (existing > 0) redirect("/admin/login");

  return <SetupForm />;
}
