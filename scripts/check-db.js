#!/usr/bin/env node
/**
 * Verify the configured Postgres without starting the web app.
 *
 *   npm run check:db
 *
 * Creates the state table if needed, reads the document, and prints counts.
 * Passwords are masked in the output.
 */
import { config } from "../server/config.js";
import { closeStore, initStore, readStore, storageMode } from "../server/store.js";

function describe(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

console.log("Database check");
console.log(`  mode : ${storageMode}`);
console.log(`  url  : ${describe(config.database.url)}`);
console.log(`  ssl  : ${config.database.ssl === false ? "off" : config.database.ssl ? "on" : "default"}`);

if (storageMode !== "postgres") {
  console.error("\nFAIL: DATABASE_URL is not set. Add it to .env and rerun.");
  process.exit(1);
}

try {
  await initStore();
  const store = await readStore();
  console.log("\nOK");
  console.log(`  demos     : ${store.demos.length}`);
  console.log(`  contacts  : ${store.contacts.length}`);
  console.log(`  purchases : ${store.purchases.length}`);
  console.log(`  events    : ${store.events.length}`);
} catch (error) {
  console.error(`\nFAIL: ${error.message}`);
  if (error.code === "28P01") {
    console.error("The password was rejected. Check the database password (URL-encode special characters).");
  }
  if (error.code === "ENOTFOUND" || error.code === "ENOENT" || error.code === "ECONNREFUSED") {
    console.error("The host could not be reached. For Supabase, use Connect -> Session pooler (IPv4) instead of db.<ref>.supabase.co, which is IPv6-only.");
  }
  if (/self.signed|SSL/i.test(error.message)) {
    console.error("Try DATABASE_SSL=true, or add ?sslmode=require to DATABASE_URL.");
  }
  process.exitCode = 1;
} finally {
  await closeStore();
}
