/**
 * Database Client - Drizzle ORM with PostgreSQL
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema.js";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres requires SSL; set rejectUnauthorized false for convenience
  // when using Render's managed Postgres. This is safe for short-lived connections
  // in this deployment context. For stricter verification, provide CA certs.
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool, { schema });

export { db, pool };
