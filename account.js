import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { getPlan } from "./kb.js";

const sessions = new Map();
const SESSION_TTL = Math.max(5, config.account.sessionMinutes) * 60 * 1000;

const READ_PATHS = {
  account: ["/api/auth/me", "/api/org/me"],
  performance: ["/api/analytics/overview"],
  teamBenchmark: ["/api/analytics/team-benchmark"],
  callbacks: ["/api/callbacks?status=open"],
  team: ["/api/users/reps"],
  assignments: ["/api/roleplay/assignments"],
  queue: ["/api/queue"],
  watchlist: ["/api/watchlist"],
  arrivals: ["/api/arrivals"],
  sites: ["/api/sites"],
  keywords: ["/api/keywords"],
};

function httpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function planLabel(planId) {
  const plan = getPlan(planId);
  if (plan) return plan.name;
  if (!planId) return "No plan";
  return planId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function appRequest(path, { method = "GET", body, cookies } = {}) {
  const url = `${config.appOrigin}${path}`;
  const headers = {
    Accept: "application/json",
    Origin: config.appOrigin,
    Referer: `${config.appOrigin}/`,
    "User-Agent": "SalvagePulseChatbot/1.0",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookies) headers.Cookie = cookies;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw httpError(502, "Could not reach the Salvage Pulse app. Please try again.");
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  return { status: response.status, data, text, setCookies: response.headers.getSetCookie?.() || [] };
}

function cookieHeader(setCookies) {
  return setCookies
    .map((cookie) => String(cookie).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function publicUser(me) {
  if (!me) return null;
  return {
    id: me.id,
    name: me.name,
    email: me.email,
    role: me.role,
    title: me.title,
    must_change_password: Boolean(me.must_change_password),
  };
}

function publicOrg(org) {
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    plan: org.plan,
    plan_name: planLabel(org.plan),
    status: org.status,
    access: org.access,
    trial_ends_at: org.trial_ends_at,
    trial_ended: org.trial_ended,
    days_left: org.days_left,
    reps: org.reps,
    max_reps: org.max_reps,
    extra_rep_packs: org.extra_rep_packs,
    extra_pack_price: org.extra_pack_price,
    sites_used: org.sites_used,
    max_sites: org.max_sites,
    extra_sites: org.extra_sites,
    billing_interval: org.billing_interval,
    card_on_file: org.card_on_file,
    past_due_days: org.past_due_days,
  };
}

function publicAccount(session) {
  const limited = Boolean(session.me?.must_change_password);
  return {
    connected: true,
    user: publicUser(session.me),
    org: publicOrg(session.org),
    limited,
    note: limited
      ? "This account is still using its starting password. Account basics are available, but call-level data stays locked until you set your own password in the Salvage Pulse app or the Account panel."
      : null,
    expiresInMinutes: config.account.sessionMinutes,
  };
}

function getSession(token) {
  const key = cleanText(token, 200);
  if (!key) throw httpError(401, "Connect your yard account first.");
  const session = sessions.get(key);
  if (!session) throw httpError(401, "Your account connection expired. Please connect again.");
  if (Date.now() - session.lastUsed > SESSION_TTL) {
    sessions.delete(key);
    throw httpError(401, "Your account connection expired. Please connect again.");
  }
  session.lastUsed = Date.now();
  return session;
}

export function getAccountSession(token) {
  try {
    return getSession(token);
  } catch {
    return null;
  }
}

export function accountTokenIsValid(token) {
  return Boolean(getAccountSession(token));
}

export async function loginToAccount(email, password) {
  const cleanEmail = cleanText(email, 200).toLowerCase();
  if (!cleanEmail || !password) throw httpError(400, "Email and password are required.");

  const login = await appRequest("/api/auth/login", {
    method: "POST",
    body: { email: cleanEmail, password: String(password) },
  });

  if (login.status === 401 || login.status === 403) {
    throw httpError(401, "Email or password is incorrect, or the account is locked.");
  }
  if (login.status >= 400) {
    throw httpError(502, "The Salvage Pulse app could not complete the sign-in. Please try again.");
  }

  const cookies = cookieHeader(login.setCookies);
  if (!cookies) throw httpError(502, "The app did not return a session. Please try again.");

  const me = await appRequest("/api/auth/me", { cookies });
  if (me.status !== 200 || !me.data) {
    throw httpError(401, "The app did not accept the new session. Please try again.");
  }

  const org = await appRequest("/api/org/me", { cookies });

  const token = randomBytes(32).toString("hex");
  const session = {
    token,
    cookies,
    me: me.data,
    org: org.status === 200 ? org.data : null,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };
  sessions.set(token, session);

  return { token, account: publicAccount(session) };
}

export async function getAccountSummary(token) {
  const session = getSession(token);

  const [me, org] = await Promise.all([
    appRequest("/api/auth/me", { cookies: session.cookies }),
    appRequest("/api/org/me", { cookies: session.cookies }),
  ]);

  if (me.status === 401) {
    sessions.delete(session.token);
    throw httpError(401, "Your account connection expired. Please connect again.");
  }
  if (me.status !== 200 || !me.data) {
    throw httpError(502, "Could not refresh your account. Please try again.");
  }

  session.me = me.data;
  if (org.status === 200) session.org = org.data;

  return publicAccount(session);
}

export async function readAccountData(token, kind) {
  const session = getSession(token);
  const paths = READ_PATHS[kind];
  if (!paths) throw httpError(400, "Unknown account data request.");

  const results = {};
  for (const path of paths) {
    const response = await appRequest(path, { cookies: session.cookies });
    if (response.status === 401) {
      sessions.delete(session.token);
      throw httpError(401, "Your account connection expired. Please connect again.");
    }
    if (response.status === 403) {
      const detail =
        response.data?.detail ||
        "This account does not have access to that data.";
      results[path] = {
        status: 403,
        limited: /password/i.test(detail),
        detail,
      };
      continue;
    }
    if (response.status >= 400) {
      results[path] = {
        status: response.status,
        detail: response.data?.detail || `The app returned ${response.status}.`,
      };
      continue;
    }
    results[path] = response.data;
  }

  return {
    data: results,
    limited: Object.values(results).some((value) => value?.limited),
  };
}

export async function changeAccountPassword(token, currentPassword, newPassword) {
  const session = getSession(token);
  const current = String(currentPassword || "");
  const next = String(newPassword || "");

  if (!current) throw httpError(400, "Enter your current password.");
  if (next.length < 8) throw httpError(400, "Your new password must be at least 8 characters.");
  if (next === current) throw httpError(400, "Choose a password different from your current one.");

  const response = await appRequest("/api/auth/change-password", {
    method: "POST",
    cookies: session.cookies,
    body: { current_password: current, new_password: next },
  });

  if (response.status === 401) {
    sessions.delete(session.token);
    throw httpError(401, "Your account connection expired. Please connect again.");
  }
  if (response.status >= 400) {
    throw httpError(
      response.status === 400 ? 400 : 502,
      response.data?.detail || "Could not change the password. Please try again.",
    );
  }

  const refreshed = await getAccountSummary(session.token);
  return {
    ok: true,
    message:
      "Password changed on app.salvagepulsepro.com. Save the new password in your password manager — it is not stored in this chat.",
    account: refreshed,
  };
}

export async function logoutAccount(token) {
  const key = cleanText(token, 200);
  if (!key) return { ok: true };
  const session = sessions.get(key);
  sessions.delete(key);
  if (session?.cookies) {
    appRequest("/api/auth/logout", { method: "POST", cookies: session.cookies }).catch(() => {});
  }
  return { ok: true };
}

/* Remove expired in-memory sessions. No passwords are ever stored. */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.lastUsed > SESSION_TTL) sessions.delete(token);
  }
}, 60_000).unref();

export function accountAuthContext(account) {
  if (!account) {
    return "No yard account is connected. For account-specific questions, ask the visitor to connect their account in the secure Account panel. Never ask for a password in chat.";
  }
  const user = account.user || {};
  const org = account.org || {};
  const lines = [
    "A yard account is connected. Use only these facts and account tool results.",
    `User: ${user.name || "Unknown"}${user.title ? ` (${user.title})` : ""}; role: ${user.role || "unknown"}; email: ${user.email || "unknown"}.`,
    org.name ? `Yard: ${org.name}.` : "",
    org.plan_name ? `Plan: ${org.plan_name}${org.status ? ` (${org.status})` : ""}.` : "",
    org.days_left != null ? `Trial days left: ${org.days_left}.` : "",
    org.reps != null ? `Rep seats: ${org.reps}${org.max_reps != null ? ` of ${org.max_reps}` : ""}.` : "",
    org.sites_used != null ? `Locations: ${org.sites_used}${org.max_sites != null ? ` of ${org.max_sites}` : ""}.` : "",
    org.billing_interval ? `Billing interval: ${org.billing_interval}.` : "",
    org.access === false ? "Account access is currently restricted." : "",
    user.must_change_password
      ? "Account limitation: must_change_password is true. Only account basics are available; call-level data and analytics are locked until the user sets their own password."
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}
