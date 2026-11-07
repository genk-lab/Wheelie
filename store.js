import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const emptyStore = {
  demos: [],
  purchases: [],
  contacts: [],
  events: [],
};

let writeChain = Promise.resolve();

function storePath() {
  const dir = path.isAbsolute(config.dataDir)
    ? config.dataDir
    : path.join(process.cwd(), config.dataDir);
  return path.join(dir, "store.json");
}

async function ensureDir() {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
}

export async function readStore() {
  await ensureDir();
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    return { ...emptyStore, ...parsed };
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(emptyStore);
    throw error;
  }
}

export async function updateStore(mutator) {
  const run = async () => {
    const store = await readStore();
    const result = await mutator(store);
    await ensureDir();
    const tmp = `${storePath()}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(tmp, storePath());
    return result;
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
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
