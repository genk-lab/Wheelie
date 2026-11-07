import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-chat-"));
process.env.DATA_DIR = dataDir;
process.env.LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.SMTP_HOST = "";
process.env.STRIPE_SECRET_KEY = "";
process.env.CALCOM_URL = "https://cal.com/gen-keech-avipdc/live-demo";

const { runAssistant } = await import("../server/chat.js");

test("guided mode compares plans", async () => {
  const result = await runAssistant({ message: "Compare your plans", sessionId: "test-session" });
  assert.equal(result.mode, "guided");
  const action = result.actions.find((item) => item.type === "plans");
  assert.ok(action);
  assert.equal(action.plans.length, 5);
});

test("guided mode opens the Cal.com demo booking card", async () => {
  const result = await runAssistant({ message: "Can I book a demo next week?", sessionId: "test-session" });
  const action = result.actions.find((item) => item.type === "calcom");
  assert.ok(action);
  assert.equal(action.url, "https://cal.com/gen-keech-avipdc/live-demo");
});

test("guided mode routes a purchase to sales while Stripe is disconnected", async () => {
  const result = await runAssistant({ message: "I want to subscribe to Pro monthly", sessionId: "test-session" });
  const action = result.actions.find((item) => item.type === "contact_form");
  assert.ok(action);
  assert.equal(action.department, "sales");
  assert.match(action.reason, /Pro/);
  assert.doesNotMatch(result.reply, /checkout is ready/i);
});

test("guided mode routes an annual plan selection to sales", async () => {
  const result = await runAssistant({ message: "Start the Enterprise plan yearly", sessionId: "test-session" });
  const action = result.actions.find((item) => item.type === "contact_form");
  assert.ok(action);
  assert.match(action.reason, /Enterprise/);
  assert.match(action.reason, /annual/);
});

test("guided mode surfaces the free trial", async () => {
  const result = await runAssistant({ message: "Do you have a free trial?", sessionId: "test-session" });
  const links = result.actions.find((item) => item.type === "links");
  assert.ok(links);
  assert.ok(links.links.some((link) => /trial/i.test(link.label)));
  assert.ok(links.links.some((link) => link.url.includes("cal.com")));
});

test("guided mode routes login questions to the app", async () => {
  const result = await runAssistant({ message: "I am locked out of my account", sessionId: "test-session" });
  const links = result.actions.find((item) => item.type === "links");
  assert.ok(links);
  assert.ok(links.links.some((link) => link.url.includes("app.salvagepulsepro.com")));
  assert.doesNotMatch(result.reply, /password is/i);
});

test("guided mode answers product questions from the knowledge base", async () => {
  const result = await runAssistant({ message: "How does call scoring work?", sessionId: "test-session" });
  assert.match(result.reply, /Greeting|Needs Discovery|7/i);
});

test("account-specific questions prompt a secure account connection", async () => {
  const result = await runAssistant({ message: "What plan am I on?", sessionId: "test-session" });
  assert.ok(result.actions.some((item) => item.type === "account_login"));
  assert.match(result.reply, /account/i);
  assert.doesNotMatch(result.reply, /password is/i);
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
