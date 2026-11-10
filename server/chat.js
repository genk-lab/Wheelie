import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { sections, getPlan, plans, retrieveKnowledge } from "./kb.js";
import { chatCompletion, llmEnabled, systemPrompt } from "./llm.js";
import { addEvent, updateStore } from "./store.js";
import { bookDemo, demoIcs, getAvailability } from "./scheduler.js";
import { sendContactEmail, sendDemoEmails } from "./mailer.js";
import { createCheckoutSession, stripeEnabled } from "./stripe.js";
import { accountAuthContext, getAccountSummary, readAccountData } from "./account.js";
import { clean, cleanMultiline, isEmail } from "./util.js";

const PLAN_ALIASES = [
  ["enterprise platinum", "enterprise_platinum"],
  ["ent platinum", "enterprise_platinum"],
  ["ent. platinum", "enterprise_platinum"],
  ["pro platinum", "pro_unlimited"],
  ["pro_unlimited", "pro_unlimited"],
  ["starter", "starter"],
  ["pro", "pro"],
  ["enterprise", "enterprise"],
];

const DEFAULT_SUGGESTIONS = [
  "What does Salvage Pulse do?",
  "Compare plans",
  "How does delivery dispatch work?",
  "Book a 1-on-1 demo",
];

function publicPlans() {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline,
    price: plan.price,
    priceYearly: plan.priceYearly,
    maxReps: plan.maxReps,
    popular: plan.popular,
    features: plan.features,
  }));
}

function calcomAction() {
  if (!config.demo.calcomUrl) return null;
  return {
    type: "calcom",
    url: config.demo.calcomUrl,
    durationMinutes: config.demo.durationMinutes,
    timezoneLabel: config.demo.timezoneLabel,
  };
}

function demoAction(prefill = {}) {
  const calcom = calcomAction();
  if (calcom) return calcom;
  return { type: "demo_form", slots: [], prefill };
}

function findPlanInText(text) {
  const lower = String(text || "").toLowerCase();
  for (const [alias, id] of PLAN_ALIASES) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      return getPlan(id);
    }
  }
  return null;
}

function findInterval(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(annual|annually|yearly|year|yr)\b/.test(lower)) return "year";
  if (/\b(monthly|month|mo)\b/.test(lower)) return "month";
  return null;
}

function wantsBuy(text) {
  return /\b(buy|purchase|checkout|check out|subscribe|subscription|pay|start|sign up|signup|get started|i'?ll take|let'?s do it|proceed)\b/i.test(
    text,
  );
}

function planSummaryText(plan, interval = null) {
  const monthly = `$${plan.price.toLocaleString("en-US")}/mo`;
  const yearly = `$${plan.priceYearly.toLocaleString("en-US")}/yr`;
  const features = (plan.features || []).slice(0, 4).join(" · ");
  return `${plan.name} is ${interval === "year" ? yearly : interval === "month" ? monthly : `${monthly} or ${yearly}`}. ${plan.tagline}${features ? ` Includes: ${features}.` : ""}`;
}

function checkoutPendingReply(plan, interval = null) {
  const interest = plan
    ? `${plan.name}${interval ? ` (${interval === "year" ? "annual" : "monthly"})` : ""}`
    : "a Salvage Pulse plan";
  return {
    reply:
      "Self-serve Stripe checkout is still being connected on this deployment. I can send your interest to the sales team and they will follow up with a secure payment link — or we can book a quick demo first.",
    actions: [
      {
        type: "contact_form",
        department: "sales",
        reason: `Purchase interest: ${interest}`,
      },
    ],
    suggestions: ["Talk to sales", "Book a demo", "Compare plans"],
  };
}

function accountBasicsReply(account) {
  const user = account.user || {};
  const org = account.org || {};
  const parts = [
    `You're signed in as **${user.name || "your account"}**${user.title ? `, ${user.title}` : ""}${
      org.name ? ` at **${org.name}**` : ""
    }.`,
  ];
  if (org.plan_name) parts.push(`Plan: **${org.plan_name}**${org.status ? ` (${org.status})` : ""}.`);
  if (org.days_left != null) parts.push(`Trial: ${org.days_left} day${Number(org.days_left) === 1 ? "" : "s"} left.`);
  if (org.reps != null) {
    parts.push(`Rep seats: ${org.reps}${org.max_reps != null ? ` of ${org.max_reps}` : ""} in use.`);
  }
  if (org.sites_used != null) {
    parts.push(`Locations: ${org.sites_used}${org.max_sites != null ? ` of ${org.max_sites}` : ""}.`);
  }
  if (org.billing_interval) parts.push(`Billing: ${org.billing_interval === "year" ? "annual" : "monthly"}.`);
  if (org.access === false) parts.push("Account access is currently restricted.");
  if (user.must_change_password) {
    parts.push(
      "This account is still on its starting password, so the app only exposes account basics. Set your own password in the Account panel to unlock call-level data.",
    );
  }
  return parts.join(" ");
}

function accountQuestion(text) {
  return (
    /\b(my|our|account|am i|do i|do we|does my|does our)\b/i.test(text) &&
    /\b(plan|subscription|trial|bill|rep|seat|role|permission|yard|callbacks?|calls?|queue|score|performance|close|conversion|team|roleplay|assignment|watchlist|inventory|stock|arrival|usage|limit|status|overview|summary)\b/i.test(
      text,
    )
  );
}

function accountRequiredReply(reason = "") {
  return {
    reply:
      "I can answer that from your yard account. Connect it with the Account button — you sign in through app.salvagepulsepro.com, and I never store your password. Once connected, I can look up your plan, seats, callbacks, scores, and team.",
    actions: [{ type: "account_login", reason }],
    suggestions: ["Connect my account", "Compare plans", "Book a demo"],
  };
}

function summarizePerformance(data) {
  const overview = data["/api/analytics/overview"] || {};
  const bits = [];
  if (overview.total_calls != null) bits.push(`${overview.total_calls} calls`);
  if (overview.open_callbacks != null) bits.push(`${overview.open_callbacks} open callbacks`);
  if (overview.avg_score != null) bits.push(`average QA score ${overview.avg_score}`);
  if (overview.close_rate != null) bits.push(`close rate ${overview.close_rate}%`);
  if (overview.won != null && overview.sales_calls != null) bits.push(`${overview.won} won from ${overview.sales_calls} sales calls`);
  if (overview.total_revenue != null) bits.push(`$${Number(overview.total_revenue).toLocaleString("en-US")} in tracked revenue`);
  if (Array.isArray(overview.category_breakdown) && overview.category_breakdown.length) {
    const top = [...overview.category_breakdown].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    if (top?.category) bits.push(`top call category: ${top.category} (${top.count || 0})`);
  }
  if (Array.isArray(overview.score_trend) && overview.score_trend.length) {
    const latest = overview.score_trend[overview.score_trend.length - 1];
    if (latest?.avg_score != null) bits.push(`latest daily score ${latest.avg_score}`);
  }
  if (!bits.length) {
    return "I pulled the performance report from your account, but it does not contain the usual summary fields yet. I can show the raw report below.";
  }
  return `Here is your account performance: ${bits.join(", ")}.`;
}

async function guidedAccountReply(message, account, token) {
  const text = message.toLowerCase();
  const forbidden = (label) => ({
    reply: `Your role (${account.user?.role || "this account"}) does not have access to the ${label} in the app. I can still answer questions about your plan, seats, and personal performance where available.`,
    actions: [{ type: "account_summary", account }],
    suggestions: ["What plan am I on?", "Show my open callbacks", "Contact support"],
  });

  if (/\b(callbacks?|follow.?up|missed caller|queue)\b/.test(text)) {
    const result = await readAccountData(token, "callbacks");
    if (result.limited) {
      return {
        reply:
          "The app is blocking call-level data because this account still uses its starting password. Set your own password in the Account panel and I can pull your callback queue.",
        actions: [{ type: "account_limited" }],
        suggestions: ["Set my password", "What plan am I on?"],
      };
    }
    const payload = result.data["/api/callbacks?status=open"];
    if (payload?.status === 403) return forbidden("callback queue");
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.callbacks) ? payload.callbacks : [];
    const count = Array.isArray(payload) ? payload.length : payload?.count ?? list.length;
    return {
      reply:
        count > 0
          ? `You have **${count}** open callback${Number(count) === 1 ? "" : "s"} right now. I've included the account data below.`
          : "Your open callback queue is clear right now.",
      actions: [{ type: "account_data", title: "Open callbacks", data: payload }],
      suggestions: ["What's my QA score?", "How many reps do I have?"],
    };
  }

  if (/\b(score|performance|close|conversion|qa|call volume|how many calls|revenue|won)\b/.test(text)) {
    const result = await readAccountData(token, "performance");
    if (result.limited) {
      return {
        reply:
          "The app is blocking call-level analytics because this account still uses its starting password. Set your own password in the Account panel and I can pull your scores and close rate.",
        actions: [{ type: "account_limited" }],
        suggestions: ["Set my password", "What plan am I on?"],
      };
    }
    if (result.data["/api/analytics/overview"]?.status === 403) {
      return forbidden("performance report");
    }
    return {
      reply: summarizePerformance(result.data),
      actions: [{ type: "account_data", title: "Performance overview", data: result.data["/api/analytics/overview"] }],
      suggestions: ["Show my open callbacks", "How many reps do I have?"],
    };
  }

  if (/\b(team|reps|users|seats)\b/.test(text)) {
    const result = await readAccountData(token, "team");
    if (result.limited) {
      return {
        reply:
          "The app is blocking the team list because this account still uses its starting password. Your seat count is in the account overview below; set your own password to see the full team.",
        actions: [{ type: "account_summary", account }, { type: "account_limited" }],
        suggestions: ["Set my password", "What plan am I on?"],
      };
    }
    const payload = result.data["/api/users/reps"];
    if (payload?.status === 403) return forbidden("team list");
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.reps) ? payload.reps : [];
    return {
      reply: `Your account has **${account.org?.reps ?? list.length}** rep seat${
        Number(account.org?.reps ?? list.length) === 1 ? "" : "s"
      } in use${account.org?.max_reps != null ? ` out of ${account.org.max_reps}` : ""}. I've included the team data below.`,
      actions: [{ type: "account_data", title: "Team", data: payload }],
      suggestions: ["Show my open callbacks", "What plan am I on?"],
    };
  }

  if (/\b(roleplay|role-play|assignment)\b/.test(text)) {
    const result = await readAccountData(token, "assignments");
    if (result.limited) {
      return {
        reply:
          "Role-play assignments are locked because this account still uses its starting password. Set your own password in the Account panel and I can pull them.",
        actions: [{ type: "account_limited" }],
        suggestions: ["Set my password", "What plan am I on?"],
      };
    }
    if (result.data["/api/roleplay/assignments"]?.status === 403) {
      return forbidden("role-play assignments");
    }
    return {
      reply: "Here are your role-play assignments from the app.",
      actions: [{ type: "account_data", title: "Role-play assignments", data: result.data["/api/roleplay/assignments"] }],
      suggestions: ["What's my QA score?", "How many reps do I have?"],
    };
  }

  if (/\b(watchlist|inventory|stock|arrival)\b/.test(text)) {
    const result = await readAccountData(token, "watchlist");
    if (result.limited) {
      return {
        reply:
          "Inventory data is locked because this account still uses its starting password. Set your own password in the Account panel and I can pull your watchlist.",
        actions: [{ type: "account_limited" }],
        suggestions: ["Set my password", "What plan am I on?"],
      };
    }
    if (result.data["/api/watchlist"]?.status === 403) {
      return forbidden("inventory watchlist");
    }
    return {
      reply: "Here is the inventory watchlist from your account.",
      actions: [{ type: "account_data", title: "Inventory watchlist", data: result.data["/api/watchlist"] }],
      suggestions: ["Show my open callbacks", "What plan am I on?"],
    };
  }

  return {
    reply: accountBasicsReply(account),
    actions: [{ type: "account_summary", account }],
    suggestions: ["What's my QA score?", "Show my open callbacks", "How many reps do I have?"],
  };
}

function trimText(value, max = 850) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

async function handleTool(name, args, meta) {
  switch (name) {
    case "show_plans": {
      return {
        result: { plans: publicPlans() },
        action: { type: "plans", plans: publicPlans(), highlight: args.highlight || null },
        suggestions: ["Book a demo", "Start a subscription", "What is included in Pro?"],
      };
    }
    case "list_demo_slots": {
      const calcom = calcomAction();
      if (calcom) {
        return {
          result: {
            provider: "Cal.com",
            bookingUrl: calcom.url,
            note: "Demos are booked on Cal.com. Share the booking link or open the booking card.",
          },
          action: calcom,
          suggestions: ["What happens on the demo?", "Compare plans"],
        };
      }
      const slots = await getAvailability();
      const shown = slots.slice(0, Math.min(Math.max(Number(args.limit) || 6, 3), 9));
      return {
        result: {
          slots: shown.map((slot) => ({ date: slot.date, time: slot.time, label: slot.label })),
          timezone: config.demo.timezone,
        },
        action: {
          type: "demo_form",
          slots: shown.map((slot) => ({ date: slot.date, time: slot.time, label: slot.label, dayLabel: slot.dayLabel, timeLabel: slot.timeLabel })),
          prefill: {},
        },
        suggestions: ["What happens on the demo?", "Compare plans"],
      };
    }
    case "start_demo_booking": {
      const calcom = calcomAction();
      if (calcom) {
        return {
          result: { opened: true, provider: "Cal.com", bookingUrl: calcom.url },
          action: calcom,
          suggestions: ["What happens on the demo?", "Compare plans"],
        };
      }
      const slots = await getAvailability();
      return {
        result: { opened: true, slotCount: slots.length },
        action: {
          type: "demo_form",
          slots: slots.slice(0, 12).map((slot) => ({
            date: slot.date,
            time: slot.time,
            label: slot.label,
            dayLabel: slot.dayLabel,
            timeLabel: slot.timeLabel,
          })),
          prefill: {
            name: clean(args.name, 120),
            email: clean(args.email, 200),
            yard: clean(args.yard, 160),
            phone: clean(args.phone, 40),
            phoneSystem: clean(args.phoneSystem, 80),
            reps: clean(args.reps, 80),
            notes: cleanMultiline(args.notes, 800),
          },
        },
        suggestions: ["What happens on the demo?", "Compare plans"],
      };
    }
    case "book_demo": {
      const calcom = calcomAction();
      if (calcom) {
        return {
          result: {
            provider: "Cal.com",
            bookingUrl: calcom.url,
            note: "Demos are booked on Cal.com. The visitor still needs to choose a time on the Cal.com page.",
          },
          action: calcom,
          suggestions: ["What happens on the demo?", "Compare plans"],
        };
      }
      const demo = await bookDemo({ ...args, source: "chatbot", sessionId: meta.sessionId });
      const email = await sendDemoEmails(demo, demoIcs(demo));
      return {
        result: {
          confirmed: true,
          id: demo.id,
          when: demo.startIso,
          yard: demo.yard,
          email: demo.email,
          durationMinutes: config.demo.durationMinutes,
          confirmationEmailSent: email.sent,
        },
        action: {
          type: "demo_confirmed",
          demo,
          icsUrl: `/api/demo/${encodeURIComponent(demo.id)}/invite.ics`,
          emailSent: email.sent,
        },
        suggestions: ["What should I prepare for the demo?", "Compare plans"],
      };
    }
    case "start_checkout": {
      if (!stripeEnabled()) {
        return {
          result: {
            error: "Stripe is not configured on this deployment yet.",
            nextStep: `Contact ${config.support.salesEmail} to complete the subscription.`,
          },
          action: {
            type: "contact_form",
            department: "sales",
            reason: "Stripe checkout is not configured",
          },
          suggestions: ["Contact sales", "Book a demo"],
        };
      }
      const session = await createCheckoutSession({
        planId: args.plan,
        interval: args.interval,
        email: args.email,
        sessionId: meta.sessionId,
      });
      await addEvent("checkout.created", {
        sessionId: meta.sessionId,
        plan: args.plan,
        interval: args.interval,
        checkoutSessionId: session.id,
      });
      const plan = getPlan(args.plan);
      const amount = args.interval === "year" ? plan.priceYearly : plan.price;
      return {
        result: {
          created: true,
          plan: plan.name,
          interval: args.interval,
          amount,
          url: session.url,
        },
        action: {
          type: "checkout_link",
          url: session.url,
          plan: plan.id,
          planName: plan.name,
          interval: args.interval,
          amount,
        },
        suggestions: ["Is checkout secure?", "Compare plans"],
      };
    }
    case "contact_team": {
      const department = args.department === "support" ? "support" : "sales";
      const email = department === "support" ? config.support.supportEmail : config.support.salesEmail;
      return {
        result: {
          department,
          email,
          reason: clean(args.reason, 300),
        },
        action: { type: "contact_form", department, reason: clean(args.reason, 300) },
        suggestions: ["Book a demo", "Compare plans"],
      };
    }
    case "connect_account": {
      return {
        result: {
          connected: false,
          reason: clean(args.reason, 300),
          note: "Open the secure Account panel. The visitor signs in with their app.salvagepulsepro.com credentials; the chatbot never receives the password.",
        },
        action: { type: "account_login", reason: clean(args.reason, 300) },
        suggestions: ["Connect my account", "Compare plans", "Book a demo"],
      };
    }
    case "get_account_overview": {
      if (!meta.accountToken) return { ...accountRequiredReply("account overview"), result: { connected: false } };
      try {
        const account = await getAccountSummary(meta.accountToken);
        return {
          result: { account },
          action: { type: "account_summary", account },
          suggestions: ["What's my QA score?", "Show my open callbacks", "How many reps do I have?"],
        };
      } catch (error) {
        return {
          result: { connected: false, error: error.message },
          action: { type: "account_login", reason: "account connection expired" },
          suggestions: ["Connect my account", "Book a demo"],
        };
      }
    }
    case "get_account_performance": {
      if (!meta.accountToken) return { ...accountRequiredReply("performance"), result: { connected: false } };
      try {
        const result = await readAccountData(meta.accountToken, "performance");
        if (result.limited) {
          return {
            result: { limited: true, detail: result.data["/api/analytics/overview"]?.detail || "Call data is locked." },
            action: { type: "account_limited" },
            suggestions: ["Set my password", "What plan am I on?"],
          };
        }
        return {
          result: { performance: result.data["/api/analytics/overview"] },
          action: { type: "account_data", title: "Performance overview", data: result.data["/api/analytics/overview"] },
          suggestions: ["Show my open callbacks", "How many reps do I have?"],
        };
      } catch (error) {
        return {
          result: { connected: false, error: error.message },
          action: { type: "account_login", reason: "account connection expired" },
          suggestions: ["Connect my account"],
        };
      }
    }
    case "get_account_callbacks": {
      if (!meta.accountToken) return { ...accountRequiredReply("callbacks"), result: { connected: false } };
      try {
        const result = await readAccountData(meta.accountToken, "callbacks");
        if (result.limited) {
          return {
            result: { limited: true, detail: "Callback data is locked until the account password is changed." },
            action: { type: "account_limited" },
            suggestions: ["Set my password", "What plan am I on?"],
          };
        }
        return {
          result: { callbacks: result.data["/api/callbacks?status=open"] },
          action: { type: "account_data", title: "Open callbacks", data: result.data["/api/callbacks?status=open"] },
          suggestions: ["What's my QA score?", "How many reps do I have?"],
        };
      } catch (error) {
        return {
          result: { connected: false, error: error.message },
          action: { type: "account_login", reason: "account connection expired" },
          suggestions: ["Connect my account"],
        };
      }
    }
    case "get_account_team": {
      if (!meta.accountToken) return { ...accountRequiredReply("team"), result: { connected: false } };
      try {
        const result = await readAccountData(meta.accountToken, "team");
        if (result.limited) {
          return {
            result: { limited: true, detail: "Team data is locked until the account password is changed." },
            action: { type: "account_limited" },
            suggestions: ["Set my password", "What plan am I on?"],
          };
        }
        return {
          result: { team: result.data["/api/users/reps"] },
          action: { type: "account_data", title: "Team", data: result.data["/api/users/reps"] },
          suggestions: ["Show my open callbacks", "What plan am I on?"],
        };
      } catch (error) {
        return {
          result: { connected: false, error: error.message },
          action: { type: "account_login", reason: "account connection expired" },
          suggestions: ["Connect my account"],
        };
      }
    }
    case "get_account_assignments": {
      if (!meta.accountToken) return { ...accountRequiredReply("role-play assignments"), result: { connected: false } };
      try {
        const result = await readAccountData(meta.accountToken, "assignments");
        if (result.limited) {
          return {
            result: { limited: true, detail: "Role-play assignments are locked until the account password is changed." },
            action: { type: "account_limited" },
            suggestions: ["Set my password", "What plan am I on?"],
          };
        }
        return {
          result: { assignments: result.data["/api/roleplay/assignments"] },
          action: {
            type: "account_data",
            title: "Role-play assignments",
            data: result.data["/api/roleplay/assignments"],
          },
          suggestions: ["What's my QA score?", "How many reps do I have?"],
        };
      } catch (error) {
        return {
          result: { connected: false, error: error.message },
          action: { type: "account_login", reason: "account connection expired" },
          suggestions: ["Connect my account"],
        };
      }
    }
    default: {
      return { result: { error: `Unknown tool: ${name}` } };
    }
  }
}

function finalTextFromActions(actions, fallback) {
  if (fallback && fallback.trim()) return fallback.trim();
  const last = actions[actions.length - 1];
  if (!last) return "I can help with that. What would you like to do next?";
  if (last.type === "plans") return "Here are the plans. Tell me your rep count and I can point you to the right one.";
  if (last.type === "demo_form") return "Pick a time that works and I will get your demo confirmed.";
  if (last.type === "calcom") return "Pick a time on the Cal.com booking page and the team will get the invite to you.";
  if (last.type === "checkout_link") return "Your secure Stripe checkout is ready below.";
  if (last.type === "contact_form") return "Send the team a note and they will get back to you.";
  return "What would you like to do next?";
}

export async function runAssistant({ message, history = [], sessionId, page = "site", accountToken = "" }) {
  const safeMessage = cleanMultiline(message, 2000);
  if (!safeMessage) {
    const error = new Error("Message is required.");
    error.status = 400;
    throw error;
  }

  const sid = clean(sessionId, 80) || `chat_${randomUUID().slice(0, 12)}`;
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-config.chat.maxHistory)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }));

  await addEvent("chat.message", { sessionId: sid, page, length: safeMessage.length });

  let account = null;
  let accountError = false;
  if (accountToken) {
    try {
      account = await getAccountSummary(accountToken);
    } catch {
      accountError = true;
    }
  }

  const accountContext = accountError
    ? "The visitor's account connection is expired or invalid. Ask them to reconnect through the Account panel. Do not guess at account data."
    : accountAuthContext(account);

  if (!llmEnabled()) {
    const guided = await guidedResponse(safeMessage, safeHistory, account, accountToken);
    return { ...guided, sessionId: sid, mode: "guided", account: account || null };
  }

  const messages = [
    { role: "system", content: systemPrompt(safeMessage, accountContext) },
    ...safeHistory,
    { role: "user", content: safeMessage },
  ];

  const actions = [];
  let suggestions = [];
  let reply = "";

  try {
    for (let round = 0; round < 4; round += 1) {
      const assistant = await chatCompletion(messages);
      messages.push({
        role: "assistant",
        content: assistant.content || "",
        ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}),
      });

      if (!assistant.tool_calls?.length) {
        reply = assistant.content || "";
        break;
      }

      for (const call of assistant.tool_calls) {
        if (call.type !== "function") continue;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        let handled;
        try {
          handled = await handleTool(call.function.name, args, { sessionId: sid, accountToken });
        } catch (toolError) {
          handled = {
            result: {
              error: toolError.message,
              hint: "Tell the visitor what went wrong and offer a human handoff or account reconnect.",
            },
          };
        }
        if (handled.action) actions.push(handled.action);
        if (handled.suggestions?.length) suggestions = handled.suggestions;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(handled.result).slice(0, 6000),
        });
      }
    }

    if (!reply.trim()) reply = finalTextFromActions(actions, "");
    return {
      reply,
      actions,
      suggestions: suggestions.length ? suggestions : DEFAULT_SUGGESTIONS,
      sessionId: sid,
      mode: "ai",
      account: account || null,
    };
  } catch (error) {
    console.error("[chat] AI failure, falling back to guided mode:", error.message);
    await addEvent("chat.ai_error", { sessionId: sid, message: error.message });
    const guided = await guidedResponse(safeMessage, safeHistory, account, accountToken);
    return { ...guided, sessionId: sid, mode: "guided", account: account || null };
  }
}

async function guidedResponse(message, history, account, accountToken) {
  if (accountQuestion(message)) {
    if (!account) return accountRequiredReply("account-specific question");
    try {
      return await guidedAccountReply(message, account, accountToken);
    } catch (error) {
      return {
        reply: `${accountBasicsReply(account)} I could not pull the deeper report right now — the app may have timed out. Please try again, or reconnect your account.`,
        actions: [{ type: "account_summary", account }],
        suggestions: ["What plan am I on?", "Book a demo", "Contact support"],
      };
    }
  }
  return guidedReply(message, history);
}

/* ------------------------------------------------------------------ */
/* Deterministic guided mode — used when no LLM key is configured or  */
/* the provider is temporarily unavailable.                           */
/* ------------------------------------------------------------------ */

function guidedReply(message, history) {
  const text = message.toLowerCase().trim();
  const plan = findPlanInText(message);
  const interval = findInterval(message);
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant")?.content || "";

  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(text) && text.length < 40) {
    return {
      reply:
        "Hey — I'm Wheelie, the Salvage Pulse assistant. I can explain the platform, compare plans, book a 1-on-1 yard demo, or connect to your account for account-specific answers. What are you trying to solve at your yard?",
      actions: [],
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (/\b(thanks|thank you|appreciate)\b/.test(text) && text.length < 60) {
    return {
      reply: "Happy to help. If you want a tailored walkthrough, I can book a 1-on-1 demo — or send you the plan comparison.",
      actions: [],
      suggestions: ["Book a demo", "Compare plans", "Contact sales"],
    };
  }

  if (/\b(trial|free day|try it|try before|no card|credit card)\b/.test(text)) {
    return {
      reply:
        "Yes — there is a free 1-day trial with no credit card required. You can ingest real phone audio and see live call scores. If you want help connecting your phone system, a 1-on-1 demo is the fastest route.",
      actions: [
        {
          type: "links",
          links: [
            { label: "Start free 1-day trial", url: config.app.signupUrl },
            ...(config.demo.calcomUrl
              ? [{ label: "Book a demo", url: config.demo.calcomUrl }]
              : []),
          ],
        },
      ],
      suggestions: ["Book a demo", "Compare plans", "What phone systems connect?"],
    };
  }

  if (/\b(contact|human|person|sales|support|email|call me|talk to|quote|procurement|security review)\b/.test(text)) {
    const department = /\b(support|technical|bug|broken|login|password|account)\b/.test(text) ? "support" : "sales";
    return {
      reply:
        department === "support"
          ? `I can connect you with yard support at ${config.support.supportEmail}. Tell me what is happening and I will route the details. Never include your password.`
          : `I can send this to the sales team at ${config.support.salesEmail}. Share your yard name, reps, and what you need and I will route it. You can also book a demo right here.`,
      actions: [{ type: "contact_form", department }],
      suggestions: ["Book a demo", "Compare plans"],
    };
  }

  if (/\b(demo|schedule|appointment|walkthrough|see it|show me|book a call|meeting)\b/.test(text)) {
    const calcom = calcomAction();
    return {
      reply: calcom
        ? "Let's get you a 1-on-1 yard demo. Pick a time on the Cal.com booking page — it takes about 45 minutes, Monday–Friday, and we will tailor it to your inventory and counter workflow."
        : "Let's get you a 1-on-1 yard demo. Pick a slot and add your details — it takes about 45 minutes, Monday–Friday, and we will tailor it to your inventory and counter workflow.",
      actions: [calcom || { type: "demo_form", slots: [], prefill: {} }],
      suggestions: ["What happens on the demo?", "Compare plans"],
    };
  }

  if (/^(monthly|month|annual|annually|yearly|year|per month|per year)$/.test(text)) {
    const lastPlan = findPlanInText(lastAssistant);
    const chosenInterval = /year|annual/.test(text) ? "year" : "month";
    if (lastPlan) {
      if (!stripeEnabled()) return checkoutPendingReply(lastPlan, chosenInterval);
      return {
        reply: `Here is the ${lastPlan.name} subscription at $${(chosenInterval === "year" ? lastPlan.priceYearly : lastPlan.price).toLocaleString("en-US")}/${
          chosenInterval === "year" ? "year" : "month"
        }. Stripe handles the card on a secure hosted page — I never ask for card details.`,
        actions: [
          {
            type: "checkout_confirm",
            plan: lastPlan.id,
            planName: lastPlan.name,
            interval: chosenInterval,
            amount: chosenInterval === "year" ? lastPlan.priceYearly : lastPlan.price,
          },
        ],
        suggestions: ["Is checkout secure?", "Compare plans"],
      };
    }
    return {
      reply: "Happy to set up monthly or annual billing. Which plan would you like? Starter, Pro, Pro Platinum, Enterprise, or Enterprise Platinum.",
      actions: [{ type: "plans", plans: publicPlans() }],
      suggestions: ["Starter", "Pro", "Enterprise", "Compare plans"],
    };
  }

  if (/\b(price|pricing|cost|how much|plans?|tiers?|subscription|compare)\b/.test(text) || plan) {
    if (plan && wantsBuy(text)) {
      if (!interval) {
        return {
          reply: `${planSummaryText(plan)} Do you want monthly or annual billing?${
            stripeEnabled() ? "" : " Self-serve checkout is being connected, so the team will send a secure payment link instead."
          }`,
          actions: [{ type: "plans", plans: publicPlans(), highlight: plan.id, interval: null }],
          suggestions: ["Monthly", "Annual", "Book a demo"],
        };
      }
      if (!stripeEnabled()) return checkoutPendingReply(plan, interval);
      return {
        reply: `Here is the ${plan.name} subscription at $${(interval === "year" ? plan.priceYearly : plan.price).toLocaleString("en-US")}/${interval === "year" ? "year" : "month"}. Stripe handles the card on a secure hosted page — I never ask for card details.`,
        actions: [
          {
            type: "checkout_confirm",
            plan: plan.id,
            planName: plan.name,
            interval,
            amount: interval === "year" ? plan.priceYearly : plan.price,
          },
        ],
        suggestions: ["Is checkout secure?", "Compare plans"],
      };
    }

    return {
      reply: plan
        ? `${planSummaryText(plan)} Want the full comparison, or should I ${
            stripeEnabled() ? "start checkout" : "connect you with sales for a payment link"
          }?`
        : "Plans run from $99/mo for Starter up to $1,149/mo for Enterprise Platinum. Annual billing is 11 months' price for 12 months, and every plan starts with a 1-day free trial — no card required. Tell me your number of reps and locations and I can point you to the right fit.",
      actions: [{ type: "plans", plans: publicPlans(), highlight: plan?.id || null }],
      suggestions: ["Start a subscription", "Book a demo", "What is included in Pro?"],
    };
  }

  if (/\b(buy|purchase|checkout|check out|subscribe|pay|start a subscription|sign up|get started)\b/.test(text)) {
    if (plan && interval) {
      if (!stripeEnabled()) return checkoutPendingReply(plan, interval);
      return {
        reply: `Here is the ${plan.name} subscription at $${(interval === "year" ? plan.priceYearly : plan.price).toLocaleString("en-US")}/${interval === "year" ? "year" : "month"}. Stripe handles the card securely.`,
        actions: [
          {
            type: "checkout_confirm",
            plan: plan.id,
            planName: plan.name,
            interval,
            amount: interval === "year" ? plan.priceYearly : plan.price,
          },
        ],
        suggestions: ["Is checkout secure?", "Compare plans"],
      };
    }
    return {
      reply: plan
        ? `${planSummaryText(plan)} Do you want monthly or annual billing?${
            stripeEnabled() ? "" : " Self-serve checkout is being connected, so the team will send a secure payment link instead."
          }`
        : "Happy to get you started. Which plan fits your team? Starter is $99/mo for up to 3 reps, Pro is $249/mo for 5 reps plus AI role-play, and Enterprise adds demand intelligence and multiple locations. I can also compare all five.",
      actions: [{ type: "plans", plans: publicPlans(), highlight: plan?.id || null }],
      suggestions: ["Starter", "Pro", "Enterprise", "Compare all plans"],
    };
  }

  if (/\b(login|log in|sign in|password|forgot|reset|locked out|account access|google)\b/.test(text)) {
    return {
      reply:
        "Sign in at app.salvagepulsepro.com/login with email and password, or use Continue with Google. First-time users may be asked to replace their starting password with one of at least 8 characters. Use “Forgot password?” if you need a reset. I never ask for passwords in chat.",
      actions: [
        {
          type: "links",
          links: [
            { label: "Open yard login", url: config.app.loginUrl },
            { label: "Forgot password", url: "https://app.salvagepulsepro.com/forgot-password" },
            { label: "Start a free trial", url: config.app.signupUrl },
          ],
        },
      ],
      suggestions: ["Book a demo", "Contact support"],
    };
  }

  if (/\b(secure|stripe|card|payment|billing|invoice|receipt|cancel|refund)\b/.test(text)) {
    const section = sections.find((item) => item.id === "billing");
    return {
      reply: trimText(section.content, 900),
      actions: [],
      suggestions: ["Compare plans", "Contact support", "Book a demo"],
    };
  }

  const matches = retrieveKnowledge(message, 2);
  if (matches.length) {
    const primary = matches[0];
    const secondary = matches[1];
    let reply = trimText(primary.content, 1400);
    if (secondary && primary.id !== secondary.id) {
      reply += `\n\nRelated: ${secondary.title}. Ask me if you want the details.`;
    }
    return {
      reply,
      actions: [],
      suggestions:
        primary.id === "pricing"
          ? ["Start a subscription", "Book a demo"]
          : ["Compare plans", "Book a demo", "Contact sales"],
    };
  }

  if (/^(ok|okay|got it|sure|sounds good|great|cool)\b/.test(text) && text.length < 40) {
    return {
      reply: lastAssistant.includes("demo")
        ? "Great — the demo form is the quickest way to lock a time. Or ask me anything else about the platform."
        : "Great. Want me to compare plans or book a 1-on-1 demo?",
      actions: [],
      suggestions: ["Compare plans", "Book a demo"],
    };
  }

  return {
    reply:
      "I can help with product questions, plan selection, demo booking, subscriptions, and account access. I do not want to guess on that one — tell me a little more, or I can connect you with the team at " +
      config.support.salesEmail +
      ".",
    actions: [],
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

/* Utility used by the contact endpoint and tests. */
export function validateContact(input) {
  const contact = {
    name: clean(input.name, 120),
    email: clean(input.email, 200).toLowerCase(),
    phone: clean(input.phone, 40),
    yard: clean(input.yard, 160),
    topic: clean(input.topic, 120),
    department: input.department === "support" ? "support" : "sales",
    message: cleanMultiline(input.message, 3000),
  };
  const errors = [];
  if (!contact.name) errors.push("Please add your name.");
  if (!isEmail(contact.email)) errors.push("Please add a valid email.");
  if (!contact.message || contact.message.length < 5) errors.push("Please add a short message.");
  return { contact, errors };
}

export async function saveContact(contact) {
  const record = {
    id: `contact_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ...contact,
    createdAt: new Date().toISOString(),
  };
  await updateStore((store) => {
    store.contacts.push(record);
  });
  const email = await sendContactEmail(record).catch((error) => ({ sent: false, error: error.message }));
  await addEvent("contact.created", { contactId: record.id, department: record.department, emailSent: email.sent });
  return { ...record, emailSent: email.sent };
}
