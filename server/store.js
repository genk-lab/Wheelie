import { config } from "./config.js";
import * as jsonStore from "./store-json.js";
import { createPostgresStore } from "./store-postgres.js";
import { emptyStore } from "./store-defaults.js";

export const storageMode = config.database.url ? "postgres" : "json";

const backend = config.database.url
  ? createPostgresStore({
      connectionString: config.database.url,
      ssl: config.database.ssl,
      max: config.database.poolMax,
    })
  : jsonStore;

export function readStore() {
  return backend.readStore();
}

export function updateStore(mutator) {
  return backend.updateStore(mutator);
}

export function initStore() {
  return backend.initStore();
}

export function closeStore() {
  return backend.close ? backend.close() : Promise.resolve();
}

export function pingStore() {
  return backend.pingStore ? backend.pingStore() : Promise.resolve();
}

export async function addEvent(type, payload = {}) {
  return updateStore((store) => {
    const event = {
      id: `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type,
      at: new Date().toISOString(),
      ...payload,
    };
    store.events.push(event);
    if (store.events.length > 2000) store.events = store.events.slice(-2000);
    return event;
  });
}

export { emptyStore };
