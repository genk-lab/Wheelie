import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let password = "owner";
let mustChangePassword = true;
let failures = 0;

const user = () => ({
  id: "user-test-owner",
  email: "owner@example.com",
  name: "Dale Miller",
  role: "owner",
  title: "Yard Owner",
  avatar_url: "",
  org_id: "org-test",
  disabled: false,
  site_id: "",
  must_change_password: mustChangePassword,
  mobile: "5551234567",
  phone: "5551234567",
  alt_phones: [],
});

const org = {
  id: "org-test",
  name: "Test Auto Salvage",
  plan: "enterprise",
  status: "demo",
  no_card_trial: false,
  email_verified: true,
  trial_ends_at: "2026-11-20T00:00:00+00:00",
  trial_ended: false,
  days_left: 7,
  access: true,
  past_due_days: 0,
  past_due_since: null,
  reps: 7,
  max_reps: 10,
  card_on_file: true,
  trial_limited: false,
  limited_starts_at: null,
  locked_features: [],
  roleplay_daily_cap: null,
  suggestion_cap: null,
  sample_data: false,
  blocked: false,
  plan_locked: [],
  extra_rep_packs: 0,
  max_extra_packs: 5,
  extra_pack_price: 50,
  preview_ends_at: null,
  preview_days_left: null,
  preview_available: false,
  preview_ending: false,
  show_enterprise_tour: false,
  billing_interval: "monthly",
  discount: null,
  max_sites: 2,
  extra_sites: 0,
  sites_used: 1,
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function authed(req) {
  return String(req.headers.cookie || "").includes("sp_session=mock-session");
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    if (body.email !== "owner@example.com" || body.password !== password) {
      failures += 1;
      return json(res, 401, { detail: "Invalid credentials" });
    }
    res.setHeader("Set-Cookie", "sp_session=mock-session; Path=/; HttpOnly; SameSite=lax");
    return json(res, 200, user());
  }

  if (!authed(req)) return json(res, 401, { detail: "Not authenticated" });

  if (req.method === "GET" && url.pathname === "/api/auth/me") return json(res, 200, user());
  if (req.method === "GET" && url.pathname === "/api/org/me") return json(res, 200, org);

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    const body = await readBody(req);
    if (body.current_password !== password) {
      return json(res, 400, { detail: "Current password is incorrect." });
    }
    if (!body.new_password || body.new_password.length < 8) {
      return json(res, 400, { detail: "New password must be at least 8 characters." });
    }
    password = body.new_password;
    mustChangePassword = false;
    return json(res, 200, { message: "Password changed." });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    res.writeHead(204);
    res.end();
    return;
  }

  const locked = mustChangePassword && url.pathname !== "/api/auth/me" && url.pathname !== "/api/org/me";
  if (locked) {
    return json(res, 403, { detail: "Choose a new password before continuing." });
  }

  if (req.method === "GET" && url.pathname === "/api/analytics/overview") {
    return json(res, 200, {
      total_calls: 142,
      open_callbacks: 3,
      avg_score: 91,
      close_rate: 38,
      won: 34,
      sales_calls: 89,
      total_revenue: 60900,
      category_breakdown: [
        { category: "Sales Inquiry", count: 80, avg_score: 92 },
        { category: "Warranty/Return", count: 22, avg_score: 88 },
      ],
      score_trend: [
        { date: "2026-11-04", avg_score: 89 },
        { date: "2026-11-05", avg_score: 91 },
      ],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/callbacks") {
    return json(res, 200, [
      { id: "cb1", customer_name: "Apex Collision", status: "open" },
      { id: "cb2", customer_name: "Bob's Garage", status: "open" },
      { id: "cb3", customer_name: "Tri-City Body", status: "open" },
    ]);
  }

  if (req.method === "GET" && url.pathname === "/api/users/reps") {
    return json(res, 200, [
      { id: "u1", name: "Jake Martinez", role: "rep" },
      { id: "u2", name: "Maria Lopez", role: "rep" },
    ]);
  }

  if (req.method === "GET" && url.pathname === "/api/roleplay/assignments") {
    return json(res, 200, [{ id: "rp1", status: "assigned", scenario: "Price objection" }]);
  }

  if (req.method === "GET" && url.pathname === "/api/watchlist") {
    return json(res, 200, [{ id: "w1", part: "5.3L EcoTec3", status: "low stock" }]);
  }

  return json(res, 404, { detail: "Not found" });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-account-"));

process.env.APP_ORIGIN = `http://127.0.0.1:${port}`;
process.env.DATA_DIR = dataDir;
process.env.LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.SMTP_HOST = "";

const {
  loginToAccount,
  getAccountSummary,
  readAccountData,
  changeAccountPassword,
  logoutAccount,
} = await import("../server/account.js");
const { runAssistant } = await import("../server/chat.js");

let token = "";

test("logs in without exposing the password or app cookie", async () => {
  const result = await loginToAccount("owner@example.com", "owner");
  token = result.token;
  assert.ok(token.length > 20);
  assert.equal(result.account.connected, true);
  assert.equal(result.account.user.name, "Dale Miller");
  assert.equal(result.account.org.plan_name, "Enterprise");
  assert.equal(result.account.limited, true);
  assert.match(result.account.note, /starting password/i);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"password"/i);
  assert.doesNotMatch(serialized, /sp_session/i);
  assert.doesNotMatch(serialized, /mock-session/i);
});

test("rejects invalid credentials", async () => {
  await assert.rejects(() => loginToAccount("owner@example.com", "wrong"), /incorrect|locked/i);
});

test("returns limited account data before the password is changed", async () => {
  const summary = await getAccountSummary(token);
  assert.equal(summary.limited, true);

  const performance = await readAccountData(token, "performance");
  assert.equal(performance.limited, true);
  assert.equal(performance.data["/api/analytics/overview"].status, 403);
});

test("guided chat answers account basics while limited", async () => {
  const result = await runAssistant({ message: "What plan am I on?", accountToken: token, sessionId: "account-chat" });
  assert.match(result.reply, /Enterprise/i);
  assert.ok(result.actions.some((action) => action.type === "account_summary"));
  assert.equal(result.account.user.name, "Dale Miller");
});

test("guided chat explains the password limitation for call data", async () => {
  const result = await runAssistant({ message: "Show my open callbacks", accountToken: token, sessionId: "account-chat" });
  assert.match(result.reply, /starting password|blocking/i);
  assert.ok(result.actions.some((action) => action.type === "account_limited"));
});

test("changes the starting password and unlocks full data", async () => {
  const changed = await changeAccountPassword(token, "owner", "new-password-123");
  assert.equal(changed.ok, true);
  assert.equal(changed.account.limited, false);

  const performance = await readAccountData(token, "performance");
  assert.equal(performance.limited, false);
  assert.equal(performance.data["/api/analytics/overview"].total_calls, 142);

  const result = await runAssistant({ message: "Show my open callbacks", accountToken: token, sessionId: "account-chat" });
  assert.match(result.reply, /3/);
  assert.ok(result.actions.some((action) => action.type === "account_data"));
});

test("rejects a wrong current password", async () => {
  await assert.rejects(() => changeAccountPassword(token, "not-the-password", "another-password-123"), /incorrect/i);
});

test("logout clears the session", async () => {
  await logoutAccount(token);
  await assert.rejects(() => getAccountSummary(token), /expired|connect/i);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});
