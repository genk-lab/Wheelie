import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, assertRuntimeConfig } from "./config.js";
import { runAssistant, saveContact, validateContact } from "./chat.js";
import { getAvailability, bookDemo, demoIcs, listDemos } from "./scheduler.js";
import { sendDemoEmails } from "./mailer.js";
import { plans } from "./kb.js";
import {
  constructWebhookEvent,
  createCheckoutSession,
  retrieveCheckoutSession,
  stripeEnabled,
} from "./stripe.js";
import { addEvent, readStore, updateStore } from "./store.js";
import {
  changeAccountPassword,
  getAccountSummary,
  loginToAccount,
  logoutAccount,
  readAccountData,
} from "./account.js";
import { buildIcs, clean, isEmail, jsonResponse } from "./util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();

app.set("trust proxy", 1);

/* ----------------------------- CORS / headers ---------------------------- */

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Admin-Token,Authorization,X-Account-Token");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

/* ------------------------------- Rate limit ------------------------------ */

const buckets = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > config.chat.rateLimitWindowMs) {
    buckets.set(key, { start: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > config.chat.rateLimitMax) {
    return jsonResponse(res, 429, {
      error: "Too many messages. Please wait a minute and try again.",
    });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > config.chat.rateLimitWindowMs * 2) buckets.delete(key);
  }
}, 120_000).unref();

/* --------------------------- Account login limit ------------------------- */

const loginBuckets = new Map();
function accountLoginLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || now - bucket.start > config.account.loginWindowMs) {
    loginBuckets.set(key, { start: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > config.account.loginMax) {
    return jsonResponse(res, 429, {
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of loginBuckets) {
    if (now - bucket.start > config.account.loginWindowMs * 2) loginBuckets.delete(key);
  }
}, 300_000).unref();

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return clean(req.headers["x-account-token"], 200);
}

/* --------------------------- Stripe raw webhook -------------------------- */

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"];
      if (!signature) return jsonResponse(res, 400, { error: "Missing Stripe signature." });
      const event = constructWebhookEvent(req.body, signature);

      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        await recordPurchase(session);
        await addEvent("stripe.checkout_completed", {
          checkoutSessionId: session.id,
          email: session.customer_details?.email || session.customer_email || "",
          amount: session.amount_total,
        });
      }

      jsonResponse(res, 200, { received: true });
    } catch (error) {
      console.error("[stripe] webhook error:", error.message);
      jsonResponse(res, 400, { error: `Webhook error: ${error.message}` });
    }
  },
);

/* ------------------------------- Body parser ----------------------------- */

app.use(express.json({ limit: "256kb" }));

/* ---------------------------------- API ---------------------------------- */

app.get("/api/health", (req, res) => {
  jsonResponse(res, 200, {
    ok: true,
    llm: Boolean(config.llm.apiKey),
    stripe: stripeEnabled(),
    smtp: Boolean(config.smtp.host),
    time: new Date().toISOString(),
  });
});

app.get("/api/config", (req, res) => {
  jsonResponse(res, 200, {
    assistant: { name: "Wheelie", avatar: "/wheelie-avatar.jpg" },
    stripeEnabled: stripeEnabled(),
    llmEnabled: Boolean(config.llm.apiKey),
    planCount: plans.length,
    demo: {
      timezone: config.demo.timezone,
      timezoneLabel: config.demo.timezoneLabel,
      durationMinutes: config.demo.durationMinutes,
      calendlyUrl: config.demo.calendlyUrl,
      calcomUrl: config.demo.calcomUrl,
    },
    contact: {
      salesEmail: config.support.salesEmail,
      supportEmail: config.support.supportEmail,
    },
    app: config.app,
  });
});

app.get("/api/plans", (req, res) => {
  jsonResponse(res, 200, { plans });
});

app.post("/api/chat", rateLimit, async (req, res, next) => {
  try {
    const { message, history, sessionId, page, accountToken } = req.body || {};
    if (!message || typeof message !== "string") {
      return jsonResponse(res, 400, { error: "Message is required." });
    }
    if (message.length > 4000) {
      return jsonResponse(res, 400, { error: "Message is too long. Please keep it under 4,000 characters." });
    }
    const result = await runAssistant({
      message,
      history,
      sessionId: clean(sessionId, 80),
      page: clean(page, 40) || "site",
      accountToken: clean(accountToken, 200),
    });
    jsonResponse(res, 200, result);
  } catch (error) {
    next(error);
  }
});

/* ------------------------------- Account API ----------------------------- */

app.post("/api/account/login", accountLoginLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await loginToAccount(email, password);
    await addEvent("account.connected", {
      email: result.account.user?.email || "",
      role: result.account.user?.role || "",
      limited: result.account.limited,
    });
    jsonResponse(res, 200, result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/summary", async (req, res, next) => {
  try {
    const token = bearerToken(req);
    const account = await getAccountSummary(token);
    jsonResponse(res, 200, { account });
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/data/:kind", async (req, res, next) => {
  try {
    const token = bearerToken(req);
    const allowed = ["account", "performance", "teamBenchmark", "callbacks", "team", "assignments", "queue", "watchlist", "arrivals", "sites", "keywords"];
    if (!allowed.includes(req.params.kind)) {
      return jsonResponse(res, 404, { error: "Unknown account data request." });
    }
    const data = await readAccountData(token, req.params.kind);
    jsonResponse(res, 200, data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/change-password", accountLoginLimit, async (req, res, next) => {
  try {
    const token = bearerToken(req);
    const { currentPassword, newPassword } = req.body || {};
    const result = await changeAccountPassword(token, currentPassword, newPassword);
    await addEvent("account.password_changed", {
      email: result.account.user?.email || "",
      role: result.account.user?.role || "",
    });
    jsonResponse(res, 200, result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/logout", async (req, res, next) => {
  try {
    const token = bearerToken(req);
    await logoutAccount(token);
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/demo/availability", async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || config.demo.daysAhead, 1), config.demo.daysAhead);
    const slots = await getAvailability({ days });
    jsonResponse(res, 200, {
      slots,
      timezone: config.demo.timezone,
      timezoneLabel: config.demo.timezoneLabel,
      durationMinutes: config.demo.durationMinutes,
      calendlyUrl: config.demo.calendlyUrl,
      calcomUrl: config.demo.calcomUrl,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/demo/book", rateLimit, async (req, res, next) => {
  try {
    const demo = await bookDemo({ ...req.body, source: "website" });
    const email = await sendDemoEmails(demo, demoIcs(demo)).catch((error) => ({
      sent: false,
      errors: [error.message],
    }));

    await updateStore((store) => {
      const record = store.demos.find((item) => item.id === demo.id);
      if (record) {
        record.emailSent = email.sent;
        record.emailErrors = email.errors || [];
      }
    });

    jsonResponse(res, 201, {
      demo,
      icsUrl: `/api/demo/${encodeURIComponent(demo.id)}/invite.ics`,
      emailSent: email.sent,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/demo/:id/invite.ics", async (req, res, next) => {
  try {
    const store = await readStore();
    const demo = store.demos.find((item) => item.id === req.params.id);
    if (!demo) return jsonResponse(res, 404, { error: "Demo not found." });

    const ics = buildIcs(demoIcs(demo));
    res
      .status(200)
      .set("Content-Type", "text/calendar; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="salvage-pulse-demo-${demo.id}.ics"`)
      .send(ics);
  } catch (error) {
    next(error);
  }
});

app.post("/api/contact", rateLimit, async (req, res, next) => {
  try {
    const { contact, errors } = validateContact(req.body || {});
    if (errors.length) return jsonResponse(res, 400, { error: errors.join(" "), details: errors });
    const saved = await saveContact(contact);
    jsonResponse(res, 201, { ok: true, id: saved.id, emailSent: saved.emailSent });
  } catch (error) {
    next(error);
  }
});

app.post("/api/checkout", rateLimit, async (req, res, next) => {
  try {
    const { plan, interval = "month", email, sessionId, yard } = req.body || {};
    if (email && !isEmail(email)) {
      return jsonResponse(res, 400, { error: "Please provide a valid email address." });
    }
    const session = await createCheckoutSession({
      planId: plan,
      interval,
      email,
      sessionId: clean(sessionId, 80),
      yard: clean(yard, 160),
    });
    await addEvent("checkout.created", {
      plan,
      interval,
      email: email || "",
      checkoutSessionId: session.id,
      source: "web",
    });
    jsonResponse(res, 200, { url: session.url, id: session.id });
  } catch (error) {
    if (error.code === "STRIPE_NOT_CONFIGURED") {
      return jsonResponse(res, 503, {
        error: error.message,
        code: "STRIPE_NOT_CONFIGURED",
        salesEmail: config.support.salesEmail,
      });
    }
    next(error);
  }
});

app.get("/api/checkout/status", async (req, res, next) => {
  try {
    const id = clean(req.query.session_id, 200);
    if (!id) return jsonResponse(res, 400, { error: "session_id is required." });
    const session = await retrieveCheckoutSession(id);
    if (
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete"
    ) {
      await recordPurchase(session);
    }
    jsonResponse(res, 200, {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      email: session.customer_details?.email || session.customer_email || "",
      amountTotal: session.amount_total,
      currency: session.currency,
      plan: session.metadata?.plan || "",
      planName: session.metadata?.plan_name || "",
      interval: session.metadata?.interval || "",
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id || "",
    });
  } catch (error) {
    next(error);
  }
});

/* --------------------------------- Admin --------------------------------- */

function adminAllowed(req) {
  if (!config.adminToken) return false;
  const supplied = req.query.token || req.headers["x-admin-token"];
  return supplied && supplied === config.adminToken;
}

app.get("/api/admin/summary", async (req, res) => {
  if (!adminAllowed(req)) return jsonResponse(res, 404, { error: "Not found." });
  const store = await readStore();
  const demos = await listDemos({ limit: 200 });
  jsonResponse(res, 200, {
    counts: {
      demos: store.demos.length,
      contacts: store.contacts.length,
      purchases: store.purchases.length,
    },
    demos,
    contacts: store.contacts.slice().reverse().slice(0, 200),
    purchases: store.purchases.slice().reverse().slice(0, 200),
    recentEvents: store.events.slice(-50).reverse(),
  });
});

/* ------------------------------- Static app ------------------------------ */

app.get("/", (req, res) => {
  res.sendFile(path.join(root, "public", "demo.html"));
});

app.get("/full", (req, res) => {
  res.sendFile(path.join(root, "public", "index.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(root, "public", "index.html"));
});

app.use(
  express.static(path.join(root, "public"), {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
    },
  }),
);

app.get("/admin", (req, res) => {
  res.sendFile(path.join(root, "public", "admin.html"));
});

app.get("/widget", (req, res) => {
  res.sendFile(path.join(root, "public", "index.html"));
});

/* -------------------------------- Errors --------------------------------- */

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return jsonResponse(res, 404, { error: "API endpoint not found." });
  }
  res.status(404).sendFile(path.join(root, "public", "404.html"));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return jsonResponse(res, 400, { error: "Invalid JSON body." });
  }
  const status = Number(error.status) || 500;
  if (status >= 500) console.error("[server]", error);
  jsonResponse(res, status, {
    error:
      status >= 500
        ? "Something went wrong on our side. Please try again, or email sales@salvagepulse.com."
        : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
});

app.listen(config.port, () => {
  console.log(`\nSalvage Pulse chatbot running at ${config.baseUrl}`);
  for (const warning of assertRuntimeConfig()) console.log(`  ! ${warning}`);
  console.log(`  Demo booking: ${config.demo.calcomUrl || "built-in scheduler"}`);
  console.log(`  Account-aware: ${config.appOrigin}`);
  console.log(`  Health: ${config.baseUrl}/api/health\n`);
});

/* ------------------------------- Helpers --------------------------------- */

async function recordPurchase(session) {
  const email = session.customer_details?.email || session.customer_email || "";
  const amount = session.amount_total || 0;
  await updateStore((store) => {
    if (store.purchases.some((item) => item.checkoutSessionId === session.id)) return;
    store.purchases.push({
      id: `purchase_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      checkoutSessionId: session.id,
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id || "",
      email,
      name: session.customer_details?.name || "",
      amount,
      currency: session.currency || config.stripe.currency,
      plan: session.metadata?.plan || "",
      planName: session.metadata?.plan_name || "",
      interval: session.metadata?.interval || "",
      status: session.payment_status || session.status || "",
      createdAt: new Date().toISOString(),
    });
  });
}
