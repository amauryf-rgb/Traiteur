import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshStaffSessionToken, STAFF_COOKIE_NAME, STAFF_SESSION_DURATION_MS } from "@/lib/auth";

// Session pro glissante (renforcement sécurité — voir lib/auth.ts pour le
// détail) : toute requête authentifiée vers l'espace pro reconduit
// l'expiration de 4h à partir de maintenant, au lieu de rester figée sur sa
// valeur de connexion initiale. Doit vivre ici (pas dans une page ou une
// action) car cookies().set() n'est autorisé que dans une Server Function
// ou un Route Handler — jamais pendant le rendu d'un Server Component, or
// la plupart des pages /pro/** sont justement de simples Server Components
// qui ne font que LIRE la session.
//
// Le fichier s'appelle proxy.ts, pas middleware.ts : renommage Next.js 16
// (voir node_modules/next/dist/docs/.../file-conventions/proxy.md), le
// comportement est identique à l'ancien "middleware".
export function proxy(request: NextRequest) {
  const token = request.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const refreshed = refreshStaffSessionToken(token);
  if (!refreshed) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(STAFF_COOKIE_NAME, refreshed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_SESSION_DURATION_MS / 1000,
  });
  return response;
}

export const config = {
  // Les Server Functions (actions serveur) sont traitées comme des POST vers
  // la route où elles sont appelées, pas comme des routes séparées — un clic
  // sur un bouton depuis /[slug]/pro/catalogue passe donc aussi par ici,
  // pas seulement les chargements de page.
  matcher: ["/:slug/pro/:path*", "/api/purchase-invoice-scan/:path*"],
};
