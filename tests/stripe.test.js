import test from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = "";
process.env.DATA_DIR = "data-test-stripe";
process.env.APP_BASE_URL = "https://chat.example.com/";

const { amountFor, buildCheckoutParams, createCheckoutSession, stripeEnabled } = await import("../server/stripe.js");
const { getPlan } = await import("../server/kb.js");

test("maps plan amounts by interval", () => {
  assert.equal(amountFor(getPlan("starter"), "month"), 99);
  assert.equal(amountFor(getPlan("starter"), "year"), 1089);
  assert.equal(amountFor(getPlan("pro"), "year"), 2739);
  assert.equal(amountFor(getPlan("enterprise_platinum"), "year"), 12639);
});

test("builds a subscription Checkout Session payload", () => {
  const params = buildCheckoutParams({
    planId: "pro",
    interval: "year",
    email: "owner@example.com",
    sessionId: "chat_123",
    yard: "Test Yard",
  });

  assert.equal(params.mode, "subscription");
  assert.equal(params.customer_email, "owner@example.com");
  assert.equal(params.client_reference_id, "chat_123");
  assert.equal(params.metadata.plan, "pro");
  assert.equal(params.metadata.interval, "year");
  assert.equal(params.metadata.yard, "Test Yard");
  assert.equal(params.line_items[0].price_data.unit_amount, 273900);
  assert.deepEqual(params.line_items[0].price_data.recurring, { interval: "year" });
  assert.match(params.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.equal(params.cancel_url, "https://chat.example.com/cancel.html");
  assert.equal(params.allow_promotion_codes, true);
});

test("builds a monthly payload for the Starter plan", () => {
  const params = buildCheckoutParams({ planId: "starter", interval: "month" });
  assert.equal(params.line_items[0].price_data.unit_amount, 9900);
  assert.deepEqual(params.line_items[0].price_data.recurring, { interval: "month" });
  assert.equal(params.customer_email, undefined);
});

test("reports Stripe as disabled without a key", () => {
  assert.equal(stripeEnabled(), false);
});

test("refuses checkout without Stripe configuration", async () => {
  await assert.rejects(
    () => createCheckoutSession({ planId: "pro", interval: "month" }),
    /Stripe is not configured/i,
  );
});

test("rejects an unknown plan before calling Stripe", async () => {
  await assert.rejects(
    () => createCheckoutSession({ planId: "nope", interval: "month" }),
    /valid plan/i,
  );
});

test("rejects an invalid billing interval", () => {
  assert.throws(() => buildCheckoutParams({ planId: "pro", interval: "week" }), /month or year/i);
});
