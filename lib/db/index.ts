import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Connexion applicative réelle : doit utiliser un rôle sans BYPASSRLS
// (app_user), jamais le rôle owner utilisé par les migrations — sinon RLS
// ne protège rien en pratique. DATABASE_URL_APP est ce rôle ; on retombe sur
// DATABASE_URL uniquement si l'environnement n'a pas encore été configuré
// avec un rôle applicatif dédié (ex. avant la bascule en production).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
