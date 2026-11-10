import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { createPostgresStore } from "../server/store-postgres.js";

const db = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = db.adapters.createPg();
const pool = new Pool();
const store = createPostgresStore({ pool });

test("initializes the schema and returns an empty store", async () => {
  await store.initStore();
  const value = await store.readStore();
  assert.deepEqual(value, { demos: [], purchases: [], contacts: [], events: [] });
});

test("persists updates and returns the mutator result", async () => {
  const contact = { id: "contact_1", name: "Ace" };
  const returned = await store.updateStore((state) => {
    state.contacts.push(contact);
    return contact.id;
  });

  assert.equal(returned, "contact_1");
  const value = await store.readStore();
  assert.equal(value.contacts.length, 1);
  assert.equal(value.contacts[0].name, "Ace");
});

test("keeps fields that the document did not contain", async () => {
  const value = await store.readStore();
  assert.deepEqual(Object.keys(value).sort(), ["contacts", "demos", "events", "purchases"]);
});

test("serializes sequential updates", async () => {
  for (let index = 0; index < 20; index += 1) {
    await store.updateStore((state) => {
      state.events.push({ id: `evt_${index}`, type: "test" });
    });
  }
  const value = await store.readStore();
  assert.equal(value.events.length, 20);
});

test.after(async () => {
  await pool.end();
});
