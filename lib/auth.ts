import { cookies } from "next/headers";
import crypto from "crypto";

// Accès allégé propriétaire/employé (voir staff_members.access_code dans le
// schéma) : pas de mot de passe complet, juste un code vérifié contre cette
// table. La session est un cookie signé (HMAC), sans table de sessions —
// cohérent avec la simplicité voulue pour ce parcours.
const COOKIE_NAME = "staff_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export type StaffSession = {
  staffMemberId: string;
  establishmentId: string;
  name: string;
  role: string;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET n'est pas configuré.");
  return secret;
}

function sign(payload: StaffSession): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verify(token: string): StaffSession | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as StaffSession;
  } catch {
    return null;
  }
}

export async function createStaffSession(staff: { id: string; establishmentId: string; name: string; role: string }) {
  const payload: StaffSession = {
    staffMemberId: staff.id,
    establishmentId: staff.establishmentId,
    name: staff.name,
    role: staff.role,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const store = await cookies();
  store.set(COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verify(token);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export async function clearStaffSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
