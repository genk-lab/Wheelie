import Stripe from "stripe";
import { config } from "./config.js";
import { getPlan } from "./kb.js";

let stripeClient = null;

export function stripeEnabled() {
  return Boolean(config.stripe.secretKey);
}

export function getStripe() {
  if (!stripeEnabled()) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey, {
      appInfo: { name: "Salvage Pulse Chatbot", version: "1.0.0" },
    });
  }
  return stripeClient;
}

export function amountFor(plan, interval) {
  return interval === "year" ? plan.priceYearly : plan.price;
}

export function buildCheckoutParams({ planId, interval = "month", email, sessionId, yard }) {
  const plan = getPlan(planId);
  if (!plan) {
    const error = new Error("Please choose a valid plan.");
    error.status = 400;
    throw error;
  }
  if (!["month", "year"].includes(interval)) {
    const error = new Error("Billing interval must be month or year.");
    error.status = 400;
    throw error;
  }

  const amount = amountFor(plan, interval);
  const metadata = {
    plan: plan.id,
    plan_name: plan.name,
    interval,
    source: "salvage-pulse-chatbot",
    chat_session: sessionId || "",
    yard: yard || "",
  };

  const params = {
    mode: "subscription",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: config.stripe.currency,
          unit_amount: Math.round(amount * 100),
          recurring: { interval: interval === "year" ? "year" : "month" },
          product_data: {
            name: `${plan.name} — Salvage Pulse AI`,
            description: plan.tagline,
          },
        },
      },
    ],
    success_url: `${config.baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/cancel.html`,
    allow_promotion_codes: config.stripe.allowPromotionCodes,
    billing_address_collection: "auto",
    metadata,
    subscription_data: { metadata },
    custom_text: {
      submit: {
        message:
          "Secure subscription by Stripe. Your 1-day free trial is separate — this checkout starts the paid plan.",
      },
    },
  };

  if (sessionId) params.client_reference_id = sessionId;
  if (email) params.customer_email = email;
  return params;
}

export async function createCheckoutSession(input) {
  const plan = getPlan(input.planId);
  if (!plan) {
    const error = new Error("Please choose a valid plan.");
    error.status = 400;
    throw error;
  }
  if (!["month", "year"].includes(input.interval || "month")) {
    const error = new Error("Billing interval must be month or year.");
    error.status = 400;
    throw error;
  }

  const stripe = getStripe();
  if (!stripe) {
    const error = new Error(
      "Stripe is not configured yet. Add STRIPE_SECRET_KEY to the server environment to enable checkout.",
    );
    error.status = 503;
    error.code = "STRIPE_NOT_CONFIGURED";
    throw error;
  }

  return stripe.checkout.sessions.create(buildCheckoutParams(input));
}

export async function retrieveCheckoutSession(id) {
  const stripe = getStripe();
  if (!stripe) {
    const error = new Error("Stripe is not configured.");
    error.status = 503;
    throw error;
  }
  return stripe.checkout.sessions.retrieve(id, {
    expand: ["subscription", "customer_details"],
  });
}

export function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe || !config.stripe.webhookSecret) {
    const error = new Error("Stripe webhook is not configured.");
    error.status = 503;
    throw error;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}
