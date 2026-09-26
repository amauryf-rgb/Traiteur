import { cookies } from "next/headers";
import crypto from "crypto";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET n'est pas configuré.");
  return secret;
}

// Signature HMAC générique, réutilisée pour toute session cookie de l'appli
// (staff, client) — la structure du payload est décidée par l'appelant, le
// mécanisme de signature/vérification ne change jamais. Pas de table de
// sessions : le cookie signé porte lui-même toute l'information nécessaire.
function sign<T>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verify<T>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Session staff — accès allégé propriétaire/employé (voir
// staff_members.access_code dans le schéma) : pas de mot de passe complet,
// juste un code vérifié contre cette table.
// ---------------------------------------------------------------------

// Exportées : proxy.ts a besoin du même nom de cookie et de la même durée
// pour reconduire la session de façon glissante à chaque requête
// authentifiée, sans dupliquer ces valeurs à un second endroit.
export const STAFF_COOKIE_NAME = "staff_session";
// Glissante depuis le renforcement sécurité (accès à des données comptables
// désormais) : 4h d'inactivité totale expire la session, mais toute requête
// authentifiée la reconduit de 4h à partir de ce moment — voir proxy.ts,
// qui réémet le cookie sur chaque requête vers /[slug]/pro/**. Une session
// activement utilisée ne coupe donc jamais en plein service ; un appareil
// oublié déverrouillé se referme de lui-même en 4h maximum.
export const STAFF_SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

export type StaffSession = {
  staffMemberId: string;
  establishmentId: string;
  name: string;
  role: string;
  exp: number;
};

export async function createStaffSession(staff: { id: string; establishmentId: string; name: string; role: string }) {
  const payload: StaffSession = {
    staffMemberId: staff.id,
    establishmentId: staff.establishmentId,
    name: staff.name,
    role: staff.role,
    exp: Date.now() + STAFF_SESSION_DURATION_MS,
  };
  const store = await cookies();
  store.set(STAFF_COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_SESSION_DURATION_MS / 1000,
  });
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const token = store.get(STAFF_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verify<StaffSession>(token);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

// Utilisé uniquement depuis proxy.ts (jamais depuis une page ou une action —
// cookies().set() n'y est pas autorisé côté Server Component, voir la note
// dans proxy.ts) : reçoit le cookie brut de la requête entrante, le
// re-signe avec une nouvelle expiration s'il est encore valide. Retourne
// null si le cookie est absent, invalide, ou déjà expiré — dans ce cas
// proxy.ts ne touche à rien, laissant getStaffSession() rejeter normalement
// plus loin dans le rendu.
export function refreshStaffSessionToken(token: string): string | null {
  const payload = verify<StaffSession>(token);
  if (!payload || payload.exp < Date.now()) return null;
  const refreshed: StaffSession = { ...payload, exp: Date.now() + STAFF_SESSION_DURATION_MS };
  return sign(refreshed);
}

export async function clearStaffSession() {
  const store = await cookies();
  store.delete(STAFF_COOKIE_NAME);
}

// ---------------------------------------------------------------------
// Session client — rattachée à l'établissement dans son ensemble, jamais à
// un univers particulier (traiteur/boutique sont deux entités juridiques
// côté facturation, pas deux bases clients distinctes). Un seul cookie,
// posé sur path "/", valable pour les deux tunnels : changer d'univers ne
// perd jamais la session, par construction (rien dans le payload ne
// mentionne l'univers).
// ---------------------------------------------------------------------

const CLIENT_COOKIE_NAME = "client_session";
const CLIENT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export type ClientSession = {
  clientId: string;
  establishmentId: string;
  name: string;
  exp: number;
};

export async function createClientSession(client: { id: string; establishmentId: string; name: string }) {
  const payload: ClientSession = {
    clientId: client.id,
    establishmentId: client.establishmentId,
    name: client.name,
    exp: Date.now() + CLIENT_SESSION_DURATION_MS,
  };
  const store = await cookies();
  store.set(CLIENT_COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CLIENT_SESSION_DURATION_MS / 1000,
  });
}

export async function getClientSession(): Promise<ClientSession | null> {
  const store = await cookies();
  const token = store.get(CLIENT_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verify<ClientSession>(token);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export async function clearClientSession() {
  const store = await cookies();
  store.delete(CLIENT_COOKIE_NAME);
}

// ---------------------------------------------------------------------
// Session platform admin — cookie séparé des sessions staff/client, jamais
// posé ni lu par le code par-établissement. C'est cette séparation (pas
// seulement le rôle) qui garantit qu'une session staff, même owner, ne
// donne jamais accès à /admin.
// ---------------------------------------------------------------------

const PLATFORM_ADMIN_COOKIE_NAME = "platform_admin_session";
const PLATFORM_ADMIN_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export type PlatformAdminSession = {
  platformAdminId: string;
  name: string;
  exp: number;
};

export async function createPlatformAdminSession(admin: { id: string; name: string }) {
  const payload: PlatformAdminSession = {
    platformAdminId: admin.id,
    name: admin.name,
    exp: Date.now() + PLATFORM_ADMIN_SESSION_DURATION_MS,
  };
  const store = await cookies();
  store.set(PLATFORM_ADMIN_COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_ADMIN_SESSION_DURATION_MS / 1000,
  });
}

export async function getPlatformAdminSession(): Promise<PlatformAdminSession | null> {
  const store = await cookies();
  const token = store.get(PLATFORM_ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verify<PlatformAdminSession>(token);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export async function clearPlatformAdminSession() {
  const store = await cookies();
  store.delete(PLATFORM_ADMIN_COOKIE_NAME);
}

// ---------------------------------------------------------------------
// Mots de passe client — scrypt natif (module crypto de Node), pas de
// dépendance ajoutée, cohérent avec le HMAC déjà utilisé ci-dessus.
// ---------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const suppliedBuffer = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

// ---------------------------------------------------------------------
// Jeton "mot de passe oublié" (platform_admins) — SHA-256, pas scrypt : un
// jeton est déjà une valeur aléatoire à haute entropie (32 octets, jamais
// choisie par un humain), le ralentissement volontaire de scrypt contre le
// bruteforce n'a pas de sens ici. Seul le hash est stocké ; le jeton en
// clair ne transite que dans l'email envoyé (voir app/admin/forgot-password).
// ---------------------------------------------------------------------

export function generatePasswordResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
