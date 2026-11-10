#!/usr/bin/env node
/**
 * One-time import of the legacy JSON store into Postgres.
 *
 *   DATABASE_URL=postgres://... npm run import:json
 *
 * Records already in the database (matched by id, or checkout session id for
 * purchases) are left alone, so it is safe to run more than once.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../server/config.js";
import { initStore, readStore, updateStore } from "../server/store.js";

if (!config.database.url) {
  console.error("DATABASE_URL is not set. Point it at Postgres and rerun.");
  process.exit(1);
}

const dir = path.isAbsolute(config.dataDir) ? config.dataDir : path.join(process.cwd(), config.dataDir);
const file = path.join(dir, "store.json");

let legacy;
try {
  legacy = JSON.parse(await fs.readFile(file, "utf8"));
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(`No local JSON store at ${file} — nothing to import.`);
    console.log("The Postgres store is already the source of truth. Start the app normally.");
    process.exit(0);
  }
  console.error(`Could not read ${file}: ${error.message}`);
  process.exit(1);
}

const keyOf = (collection, item) =>
  collection === "purchases" ? item.checkoutSessionId || item.id : item.id;

await initStore();

const result = await updateStore((store) => {
  const added = {};
  for (const collection of ["demos", "contacts", "purchases", "events"]) {
    const incoming = Array.isArray(legacy[collection]) ? legacy[collection] : [];
    const seen = new Set(store[collection].map((item) => keyOf(collection, item)));
    added[collection] = 0;
    for (const item of incoming) {
      const key = keyOf(collection, item);
      if (!key || seen.has(key)) continue;
      store[collection].push(item);
      seen.add(key);
      added[collection] += 1;
    }
  }
  return added;
});

const current = await readStore();
console.log(`Imported from ${file}`);
for (const [collection, count] of Object.entries(result)) {
  console.log(`  ${collection}: +${count} (now ${current[collection].length})`);
}
