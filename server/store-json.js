import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { normalizeStore } from "./store-defaults.js";

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
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return normalizeStore();
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

export async function initStore() {
  await ensureDir();
}
