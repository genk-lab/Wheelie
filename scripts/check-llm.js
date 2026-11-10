#!/usr/bin/env node
/**
 * Verify the configured LLM provider before deploying.
 *
 *   npm run check:llm
 *
 * Reads the same env as the server (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL).
 * Exits non-zero if the provider is missing or rejects the request, so it
 * can gate a deploy or be run after changing keys.
 */
import { config } from "../server/config.js";
import { chatCompletion } from "../server/llm.js";

function mask(key) {
  if (!key) return "(missing)";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

const started = Date.now();

console.log("LLM check");
console.log(`  base URL : ${config.llm.baseUrl}`);
console.log(`  model    : ${config.llm.model}`);
console.log(`  key      : ${mask(config.llm.apiKey)}`);
console.log(`  timeout  : ${config.llm.timeoutMs} ms`);

if (!config.llm.apiKey) {
  console.error("\nFAIL: no LLM_API_KEY (or OPENAI_API_KEY) is set. Add it to .env and rerun.");
  process.exit(1);
}

try {
  const message = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You are a connection test. Reply with exactly one short sentence confirming you are reachable.",
      },
      { role: "user", content: "Connection check — say OK." },
    ],
    { tools: [] },
  );

  const reply = String(message.content || "").trim();
  if (!reply) {
    console.error("\nFAIL: the provider returned an empty message.");
    process.exit(1);
  }

  console.log(`\nOK in ${Date.now() - started} ms`);
  console.log(`  reply: ${reply.slice(0, 300)}`);
  if (message.tool_calls?.length) {
    console.log(`  note : provider returned ${message.tool_calls.length} tool call(s) anyway.`);
  }
} catch (error) {
  console.error(`\nFAIL: ${error.message}`);
  if (error.status === 401 || /401/.test(error.message)) {
    console.error("The key was rejected. Check that it matches the provider in LLM_BASE_URL.");
  }
  if (error.status === 404) {
    console.error("The model or base URL was not found. Check LLM_MODEL and LLM_BASE_URL.");
  }
  process.exit(1);
}
