import test from "node:test";
import assert from "node:assert/strict";

// Set the environment before llm.js resolves config.
process.env.LLM_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.LLM_MODEL = "gemini-3.8-flash";
process.env.LLM_REASONING_EFFORT = "low";

const { buildChatPayload, toolDefinitions } = await import("../server/llm.js");
const { config } = await import("../server/config.js");

test("builds a Gemini-compatible chat payload with tools", () => {
  const messages = [
    { role: "system", content: "system" },
    { role: "user", content: "Compare plans" },
  ];
  const payload = buildChatPayload(messages);

  assert.equal(config.llm.provider, "gemini");
  assert.equal(payload.model, "gemini-3.8-flash");
  assert.equal(payload.reasoning_effort, "low");
  assert.equal(payload.tool_choice, "auto");
  assert.ok(Array.isArray(payload.tools));
  assert.ok(payload.tools.some((tool) => tool.function.name === "show_plans"));
  assert.deepEqual(payload.messages, messages);
  assert.equal(typeof payload.max_tokens, "number");
  assert.equal(typeof payload.temperature, "number");
});

test("omits tools when none are passed", () => {
  const payload = buildChatPayload([{ role: "user", content: "Hi" }], { tools: [] });
  assert.equal(payload.tools, undefined);
  assert.equal(payload.tool_choice, undefined);
  assert.ok(toolDefinitions.length > 0);
});
