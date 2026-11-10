import pg from "pg";
import { normalizeStore } from "./store-defaults.js";

const { Pool } = pg;

const TABLE = "wheelie_state";
const ROW_ID = "main";

/**
 * Postgres-backed store.
 *
 * The whole app state is one JSONB document behind a row lock. That keeps
 * every existing readStore/updateStore caller unchanged while making writes
 * safe across processes and giving the data a real home (backups, disk
 * limits, restarts). Swap this for tables per entity if the data set grows.
 */
export function createPostgresStore({ pool, connectionString, ssl, max } = {}) {
  const ownsPool = !pool;
  const db =
    pool ||
    new Pool({
      connectionString,
      ssl,
      max: max || 5,
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000),
    });

  if (ownsPool) {
    db.on("error", (error) => {
      console.error("[db] idle client error:", error.message);
    });
  }

  async function ensureSchema() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(
      `INSERT INTO ${TABLE} (id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [ROW_ID, JSON.stringify(normalizeStore())],
    );
  }

  async function readStore() {
    const result = await db.query(`SELECT data FROM ${TABLE} WHERE id = $1`, [ROW_ID]);
    if (!result.rows.length) {
      await ensureSchema();
      const retry = await db.query(`SELECT data FROM ${TABLE} WHERE id = $1`, [ROW_ID]);
      return normalizeStore(retry.rows[0]?.data);
    }
    return normalizeStore(result.rows[0].data);
  }

  async function updateStore(mutator) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      let result = await client.query(
        `SELECT data FROM ${TABLE} WHERE id = $1 FOR UPDATE`,
        [ROW_ID],
      );

      if (!result.rows.length) {
        // First write before init ran: create the row, then lock it.
        await client.query(
          `INSERT INTO ${TABLE} (id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [ROW_ID, JSON.stringify(normalizeStore())],
        );
        result = await client.query(
          `SELECT data FROM ${TABLE} WHERE id = $1 FOR UPDATE`,
          [ROW_ID],
        );
      }

      const store = normalizeStore(result.rows[0]?.data);
      const value = await mutator(store);

      await client.query(
        `INSERT INTO ${TABLE} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = now()`,
        [ROW_ID, JSON.stringify(store)],
      );
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function close() {
    if (ownsPool) await db.end().catch(() => {});
  }

  async function pingStore() {
    await db.query("SELECT 1");
  }

  return { readStore, updateStore, initStore: ensureSchema, close, pingStore };
}
