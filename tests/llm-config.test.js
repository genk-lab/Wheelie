import test from "node:test";
import assert from "node:assert/strict";

const { resolveLlm } = await import("../server/config.js");

test("defaults to OpenAI when nothing is configured", () => {
  const llm = resolveLlm({});
  assert.equal(llm.provider, "openai");
  assert.equal(llm.baseUrl, "https://api.openai.com/v1");
  assert.equal(llm.model, "gpt-4.1-mini");
  assert.equal(llm.apiKey, "");
  assert.equal(llm.reasoningEffort, "");
});

test("a Gemini key alone selects Gemini defaults", () => {
  const llm = resolveLlm({ GEMINI_API_KEY: "gemini-key" });
  assert.equal(llm.provider, "gemini");
  assert.equal(llm.apiKey, "gemini-key");
  assert.equal(llm.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(llm.model, "gemini-3.8-flash");
});

test("GOOGLE_API_KEY works as a Gemini key", () => {
  const llm = resolveLlm({ GOOGLE_API_KEY: "google-key" });
  assert.equal(llm.provider, "gemini");
  assert.equal(llm.apiKey, "google-key");
});

test("LLM_PROVIDER=gemini works with a key in LLM_API_KEY", () => {
  const llm = resolveLlm({ LLM_PROVIDER: "gemini", LLM_API_KEY: "shared-key" });
  assert.equal(llm.provider, "gemini");
  assert.equal(llm.apiKey, "shared-key");
  assert.equal(llm.model, "gemini-3.8-flash");
});

test("a Gemini base URL implies Gemini even without LLM_PROVIDER", () => {
  const llm = resolveLlm({
    LLM_API_KEY: "key",
    LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
  assert.equal(llm.provider, "gemini");
  assert.equal(llm.model, "gemini-3.8-flash");
  assert.equal(llm.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("an explicit model and reasoning effort are preserved", () => {
  const llm = resolveLlm({
    GEMINI_API_KEY: "gemini-key",
    LLM_MODEL: "gemini-3.1-pro-preview",
    LLM_REASONING_EFFORT: "low",
  });
  assert.equal(llm.model, "gemini-3.1-pro-preview");
  assert.equal(llm.reasoningEffort, "low");
});

test("an OpenAI key wins when both key types are present", () => {
  const llm = resolveLlm({ LLM_API_KEY: "openai-key", GEMINI_API_KEY: "gemini-key" });
  assert.equal(llm.provider, "openai");
  assert.equal(llm.apiKey, "openai-key");
  assert.equal(llm.model, "gpt-4.1-mini");
});

test("a custom base URL is reported as openai-compatible", () => {
  const llm = resolveLlm({
    LLM_API_KEY: "key",
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_MODEL: "openai/gpt-4.1-mini",
  });
  assert.equal(llm.provider, "openai-compatible");
  assert.equal(llm.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(llm.model, "openai/gpt-4.1-mini");
});
