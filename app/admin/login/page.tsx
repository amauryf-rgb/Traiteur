import { redirect } from "next/navigation";
import { getPlatformAdminCount } from "@/lib/db/queries";
import { getPlatformAdminSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// Voir app/admin/setup/page.tsx : pas de segment dynamique ici non plus,
// donc même besoin explicite pour ne jamais figer cette page au build.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getPlatformAdminSession();
  if (session) redirect("/admin");

  // Aucun compte créé nulle part : rien à connecter, direction /admin/setup.
  const existing = await getPlatformAdminCount();
  if (existing === 0) redirect("/admin/setup");

  return <LoginForm />;
}
