import "dotenv/config";

const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");

export const config = {
  port,
  baseUrl,
  publicDir: "public",
  dataDir: process.env.DATA_DIR || "data",
  adminToken: process.env.ADMIN_TOKEN || "",
  support: {
    salesEmail: process.env.SALES_EMAIL || "sales@salvagepulse.com",
    supportEmail: process.env.SUPPORT_EMAIL || "support@salvagepulse.com",
    phone: process.env.SALES_PHONE || "",
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.25),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 900),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    currency: (process.env.STRIPE_CURRENCY || "usd").toLowerCase(),
    taxBehavior: process.env.STRIPE_TAX_BEHAVIOR || "exclusive",
    allowPromotionCodes: process.env.STRIPE_ALLOW_PROMOS !== "false",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Salvage Pulse <sales@salvagepulse.com>",
  },
  appOrigin: (process.env.APP_ORIGIN || "https://app.salvagepulsepro.com").replace(/\/$/, ""),
  account: {
    sessionMinutes: Number(process.env.ACCOUNT_SESSION_MINUTES || 30),
    loginWindowMs: Number(process.env.ACCOUNT_LOGIN_WINDOW_MS || 300_000),
    loginMax: Number(process.env.ACCOUNT_LOGIN_MAX || 10),
  },
  demo: {
    timezone: process.env.DEMO_TIMEZONE || "America/New_York",
    timezoneLabel: process.env.DEMO_TIMEZONE_LABEL || "ET",
    durationMinutes: Number(process.env.DEMO_DURATION_MINUTES || 45),
    daysAhead: Number(process.env.DEMO_DAYS_AHEAD || 21),
    leadTimeHours: Number(process.env.DEMO_LEAD_TIME_HOURS || 18),
    slots: (process.env.DEMO_SLOTS || "10:00,14:00,16:30").split(",").map((s) => s.trim()).filter(Boolean),
    maxPerSlot: Number(process.env.DEMO_MAX_PER_SLOT || 1),
    calendlyUrl: process.env.CALENDLY_URL || "",
    calcomUrl:
      process.env.CALCOM_URL === "internal"
        ? ""
        : process.env.CALCOM_URL || "https://cal.com/gen-keech-avipdc/live-demo",
  },
  app: {
    loginUrl: "https://app.salvagepulsepro.com/login",
    signupUrl: "https://app.salvagepulsepro.com/signup",
    marketingUrl: "https://site.salvagepulsepro.com/",
  },
  chat: {
    maxHistory: 18,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 30,
  },
};

export function assertRuntimeConfig() {
  const warnings = [];
  if (!config.llm.apiKey) warnings.push("LLM_API_KEY is not set. The chatbot will run in guided-script mode.");
  if (!config.stripe.secretKey) warnings.push("STRIPE_SECRET_KEY is not set. Checkout will show a setup message.");
  if (!config.adminToken) warnings.push("ADMIN_TOKEN is not set. The admin page is disabled.");
  return warnings;
}
