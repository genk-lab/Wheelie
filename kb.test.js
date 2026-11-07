import test from "node:test";
import assert from "node:assert/strict";

const { plans, getPlan, retrieveKnowledge, knowledgeForPrompt } = await import("../server/kb.js");

test("has the five live plans and exact prices", () => {
  assert.equal(plans.length, 5);
  assert.deepEqual(
    plans.map((plan) => [plan.id, plan.price, plan.priceYearly]),
    [
      ["starter", 99, 1089],
      ["pro", 249, 2739],
      ["pro_unlimited", 499, 5489],
      ["enterprise", 649, 7139],
      ["enterprise_platinum", 1149, 12639],
    ],
  );
});

test("finds a plan by id", () => {
  assert.equal(getPlan("pro").name, "Pro");
  assert.equal(getPlan("missing"), null);
});

test("retrieves pricing for a price question", () => {
  const sections = retrieveKnowledge("How much does Pro cost per month?");
  assert.ok(sections.length > 0);
  assert.ok(sections.some((section) => section.id === "pricing"));
});

test("retrieves role-play and integration content", () => {
  assert.ok(retrieveKnowledge("Tell me about AI role-play practice").some((s) => s.id === "roleplay"));
  assert.ok(retrieveKnowledge("Does it connect to RingCentral?").some((s) => s.id === "phone-integration"));
});

test("builds a prompt with relevant knowledge", () => {
  const prompt = knowledgeForPrompt("How does call scoring work?");
  assert.match(prompt, /7-metric/i);
  assert.doesNotMatch(prompt, /undefined/);
});
