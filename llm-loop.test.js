import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-llm-"));
let calls = 0;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    calls += 1;
    const parsed = JSON.parse(body);
    assert.equal(parsed.model, "mock-model");
    assert.ok(Array.isArray(parsed.tools));
    assert.ok(parsed.tools.some((tool) => tool.function.name === "show_plans"));

    res.writeHead(200, { "Content-Type": "application/json" });
    if (calls === 1) {
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "show_plans", arguments: JSON.stringify({}) },
                  },
                ],
              },
            },
          ],
        }),
      );
    } else {
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Here are the five plans. Tell me your rep count and I will narrow it down.",
              },
            },
          ],
        }),
      );
    }
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

process.env.DATA_DIR = dataDir;
process.env.LLM_API_KEY = "test-key";
process.env.LLM_BASE_URL = `http://127.0.0.1:${port}`;
process.env.LLM_MODEL = "mock-model";
process.env.SMTP_HOST = "";

const { runAssistant } = await import("../server/chat.js");

test("runs the tool loop and returns UI actions plus a final reply", async () => {
  const result = await runAssistant({ message: "What plans do you have?", sessionId: "llm-test" });
  assert.equal(result.mode, "ai");
  assert.match(result.reply, /five plans/i);
  const action = result.actions.find((item) => item.type === "plans");
  assert.ok(action);
  assert.equal(action.plans.length, 5);
  assert.equal(calls, 2);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});
