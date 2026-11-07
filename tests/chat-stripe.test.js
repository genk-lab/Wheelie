import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-chat-stripe-"));
process.env.DATA_DIR = dataDir;
process.env.LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.SMTP_HOST = "";
process.env.STRIPE_SECRET_KEY = "sk_test_mock_for_guided_mode";

const { runAssistant } = await import("../server/chat.js");

test("guided mode offers checkout when Stripe is configured", async () => {
  const result = await runAssistant({ message: "I want to subscribe to Pro monthly", sessionId: "stripe-mode" });
  const action = result.actions.find((item) => item.type === "checkout_confirm");
  assert.ok(action);
  assert.equal(action.plan, "pro");
  assert.equal(action.interval, "month");
  assert.equal(action.amount, 249);
});

test("guided mode offers annual checkout when Stripe is configured", async () => {
  const result = await runAssistant({ message: "Start the Enterprise plan yearly", sessionId: "stripe-mode" });
  const action = result.actions.find((item) => item.type === "checkout_confirm");
  assert.ok(action);
  assert.equal(action.plan, "enterprise");
  assert.equal(action.interval, "year");
  assert.equal(action.amount, 7139);
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
