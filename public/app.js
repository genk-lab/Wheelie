/* global crypto */

const $ = (selector, root = document) => root.querySelector(selector);

const STORAGE_KEY = "sp-chat-v1";
const SESSION_KEY = "sp-chat-session";
const EMAIL_KEY = "sp-chat-email";
const ACCOUNT_KEY = "sp-account-token";

const DEFAULT_SUGGESTIONS = [
  "What does Salvage Pulse do?",
  "Compare plans",
  "How does delivery dispatch work?",
  "Book a 1-on-1 demo",
];

// Action cards that are safe to re-render from a restored transcript.
// Checkout confirmations and demo forms are excluded because prices and
// availability can go stale between visits.
const RESTORABLE_ACTIONS = new Set(["plans", "links", "calcom", "contact_form", "account_login"]);

const state = {
  sessionId: localStorage.getItem(SESSION_KEY) || `web_${crypto.randomUUID().slice(0, 12)}`,
  history: [],
  transcript: [],
  plans: [],
  config: null,
  suggestions: DEFAULT_SUGGESTIONS,
  sending: false,
  embed: new URLSearchParams(location.search).has("embed") || window.self !== window.top,
  accountToken: sessionStorage.getItem(ACCOUNT_KEY) || "",
  account: null,
  retryMessage: "",
};

localStorage.setItem(SESSION_KEY, state.sessionId);

const messagesEl = $("#messages");
const suggestionsEl = $("#suggestions");
const composer = $("#composer");
const input = $("#input");
const sendBtn = $("#send");
const toastEl = $("#toast");

/* ------------------------------- Utilities ------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
    (_match, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_match, prefix, url) =>
      `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
  return text;
}

function renderMarkdown(value) {
  const lines = String(value ?? "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null;

  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${inlineMarkdown(ul[1])}</li>`;
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${inlineMarkdown(ol[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${inlineMarkdown(line)}</p>`;
  }
  closeList();
  return html;
}

let formSeq = 0;

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
  }).format(Number(value) || 0);
}

function safeUrl(value) {
  const url = String(value || "");
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : "#";
}

function scrollToBottom() {
  if (!messagesEl) return;
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3800);
}

function avatarMarkup(role) {
  if (role === "assistant") {
    return `<img src="/wheelie-avatar.jpg" alt="" width="31" height="31" />`;
  }
  return "Y";
}

function addMessage(role, content, actions = [], { persist = true, focus = true } = {}) {
  if (!messagesEl) return null;

  if (persist) {
    const savedActions =
      role === "assistant"
        ? (actions || [])
            .filter((action) => RESTORABLE_ACTIONS.has(action?.type))
            .map((action) => ({
              ...action,
              ...(action.type === "plans" ? { plans: (action.plans || []).slice(0, 6) } : {}),
            }))
        : [];
    state.transcript.push({ role, content, ts: Date.now(), actions: savedActions });
    if (state.transcript.length > 40) state.transcript = state.transcript.slice(-40);
    persistTranscript();
  }

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${role}`;
  wrapper.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">${avatarMarkup(role)}</div>
    <div class="msg-body">
      <div class="msg-name">${role === "assistant" ? "Wheelie" : "You"}</div>
      <div class="bubble">${renderMarkdown(content)}</div>
      <div class="actions"></div>
    </div>`;
  messagesEl.appendChild(wrapper);

  const actionHost = wrapper.querySelector(".actions");
  for (const action of actions || []) {
    renderAction(actionHost, action);
  }

  if (focus) scrollToBottom();
  return wrapper;
}

function addTyping() {
  if (!messagesEl) return;
  const wrapper = document.createElement("div");
  wrapper.className = "msg assistant";
  wrapper.id = "typing-indicator";
  wrapper.innerHTML = `
    <div class="msg-avatar" aria-hidden="true"><img src="/wheelie-avatar.jpg" alt="" width="31" height="31" /></div>
    <div class="msg-body">
      <div class="msg-name">Wheelie</div>
      <div class="bubble"><span class="typing" aria-label="Wheelie is typing"><i></i><i></i><i></i></span></div>
    </div>`;
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function removeTyping() {
  $("#typing-indicator")?.remove();
}

function persistTranscript() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionId: state.sessionId,
        transcript: state.transcript.slice(-40),
      }),
    );
  } catch {
    /* storage may be full or disabled */
  }
}

function restoreTranscript() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.sessionId) {
      state.sessionId = saved.sessionId;
      localStorage.setItem(SESSION_KEY, state.sessionId);
    }
    const transcript = Array.isArray(saved.transcript) ? saved.transcript : [];
    if (!transcript.length) return false;

    for (const item of transcript) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") continue;
      const actions = Array.isArray(item.actions)
        ? item.actions.filter((action) => RESTORABLE_ACTIONS.has(action?.type))
        : [];
      state.transcript.push({ role: item.role, content: item.content, ts: item.ts || Date.now(), actions });
      state.history.push({ role: item.role, content: item.content });
      const wrapper = addMessage(item.role, item.content, actions, { persist: false, focus: false });
      if (wrapper) wrapper.dataset.restored = "true";
    }
    return true;
  } catch {
    return false;
  }
}

function renderSuggestions() {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = "";
  for (const text of state.suggestions || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = text;
    chip.addEventListener("click", () =>
      sendMessage(text === "Try again" && state.retryMessage ? state.retryMessage : text),
    );
    suggestionsEl.appendChild(chip);
  }
}

/* -------------------------------- Actions -------------------------------- */

const ICONS = {
  card: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
  lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
};

function renderAction(host, action) {
  if (!host || !action) return;
  switch (action.type) {
    case "plans":
      renderPlans(host, action);
      break;
    case "demo_form":
      renderDemoForm(host, action);
      break;
    case "checkout_confirm":
      renderCheckoutConfirm(host, action);
      break;
    case "checkout_link":
      renderCheckoutLink(host, action);
      break;
    case "contact_form":
      renderContactForm(host, action);
      break;
    case "links":
      renderLinks(host, action);
      break;
    case "demo_confirmed":
      renderDemoConfirmed(host, action);
      break;
    case "calcom":
      renderCalcomCard(host, action);
      break;
    case "account_login":
      renderAccountLoginCard(host, action);
      break;
    case "account_summary":
      renderAccountSummaryCard(host, action);
      break;
    case "account_data":
      renderAccountDataCard(host, action);
      break;
    case "account_limited":
      renderAccountLimitedCard(host, action);
      break;
    default:
      break;
  }
}

/* --------------------------------- Plans --------------------------------- */

function plansForAction(action) {
  if (Array.isArray(action.plans) && action.plans.length) return action.plans;
  return state.plans;
}

function renderPlans(host, action) {
  const plans = plansForAction(action);
  if (!plans.length) return;
  if (!state.plans.length) state.plans = plans;

  let interval = action.interval === "year" ? "year" : "month";
  const stripeReady = state.config?.stripeEnabled !== false;

  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Plans built to scale with your yard</h3>
        <p class="sub">Every plan starts with a free 1-day trial. No credit card required.</p>
      </div>
      <div class="interval-toggle" role="group" aria-label="Billing interval">
        <button type="button" data-interval="month">Monthly</button>
        <button type="button" data-interval="year">Annual <span class="save">1 mo free</span></button>
      </div>
    </div>
    <div class="plan-grid"></div>
    <p class="form-note" style="margin-top:10px">Annual billing is 11 months' price for 12 months. Prices in USD.${
      stripeReady ? " Taxes may apply at checkout." : " Self-serve checkout is being connected — sales can send a secure payment link."
    }</p>`;
  host.appendChild(card);

  const grid = card.querySelector(".plan-grid");
  const toggleButtons = card.querySelectorAll("[data-interval]");

  const paint = () => {
    toggleButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.interval === interval);
    });

    grid.innerHTML = plans
      .map((plan) => {
        const amount = interval === "year" ? plan.priceYearly : plan.price;
        const cadence =
          interval === "year"
            ? `≈ ${money(Math.round(plan.priceYearly / 12))}/mo · billed annually`
            : "billed monthly";
        const features = (plan.features || []).slice(0, 7);
        return `
          <article class="plan-card ${plan.popular ? "popular" : ""} ${
            action.highlight === plan.id ? "highlight" : ""
          }" data-plan-card="${escapeHtml(plan.id)}">
            ${plan.popular ? '<span class="plan-badge">Most popular</span>' : ""}
            <h4 class="plan-name">${escapeHtml(plan.name)}</h4>
            <div class="plan-price">${money(amount)}<small>/${interval === "year" ? "yr" : "mo"}</small></div>
            <p class="plan-cadence">${cadence}</p>
            <ul class="plan-features">
              ${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
            </ul>
            <div class="plan-actions">
              <button class="btn btn-primary btn-sm" type="button" ${
                stripeReady
                  ? `data-choose="${escapeHtml(plan.id)}">Choose ${escapeHtml(plan.name)}`
                  : `data-sales="${escapeHtml(plan.id)}">Talk to sales about ${escapeHtml(plan.name)}`
              }</button>
              <button class="btn btn-ghost btn-sm" type="button" data-demo="${escapeHtml(plan.id)}">
                Book a demo
              </button>
            </div>
          </article>`;
      })
      .join("");

    grid.querySelectorAll("[data-choose]").forEach((button) => {
      button.addEventListener("click", () => choosePlan(button.dataset.choose, interval));
    });
    grid.querySelectorAll("[data-sales]").forEach((button) => {
      button.addEventListener("click", () => {
        const plan = findPlan(button.dataset.sales);
        const planName = plan?.name || "Salvage Pulse";
        addLocalExchange(
          `I'm interested in ${planName}, billed ${interval === "year" ? "annually" : "monthly"}.`,
          `Self-serve checkout is still being connected, so I'll send this to sales. They can answer questions and send a secure payment link for ${planName}.`,
          [
            {
              type: "contact_form",
              department: "sales",
              reason: `Purchase interest: ${planName} (${interval === "year" ? "annual" : "monthly"})`,
            },
          ],
        );
      });
    });
    grid.querySelectorAll("[data-demo]").forEach((button) => {
      button.addEventListener("click", () => {
        const userText = "I'd like to see a demo first.";
        state.history.push({ role: "user", content: userText });
        addMessage("user", userText);
        openDemoBooking();
      });
    });
    scrollToBottom();
  };

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      interval = button.dataset.interval;
      paint();
    });
  });

  paint();
}

function findPlan(planId) {
  return state.plans.find((plan) => plan.id === planId) || null;
}

function choosePlan(planId, interval) {
  const plan = findPlan(planId);
  if (!plan) return;
  const cadence = interval === "year" ? "annual" : "monthly";

  if (state.config?.stripeEnabled === false) {
    addLocalExchange(
      `I'd like the ${plan.name} plan, billed ${cadence}.`,
      `Self-serve Stripe checkout is still being connected. I'll send your interest to sales — they can answer questions and send a secure payment link for ${plan.name}.`,
      [
        {
          type: "contact_form",
          department: "sales",
          reason: `Purchase interest: ${plan.name} (${interval === "year" ? "annual" : "monthly"})`,
        },
      ],
    );
    return;
  }

  addLocalExchange(
    `I'd like the ${plan.name} plan, billed ${cadence}.`,
    `Here's your ${plan.name} subscription at ${money(
      interval === "year" ? plan.priceYearly : plan.price,
    )}/${interval === "year" ? "year" : "month"}. Stripe handles the card on its secure hosted page — I never see card details.`,
    [
      {
        type: "checkout_confirm",
        plan: plan.id,
        planName: plan.name,
        interval,
        amount: interval === "year" ? plan.priceYearly : plan.price,
      },
    ],
  );
}

function addLocalExchange(userText, assistantText, actions = [], extraSuggestions = null) {
  state.history.push({ role: "user", content: userText });
  addMessage("user", userText);
  state.history.push({ role: "assistant", content: assistantText });
  addMessage("assistant", assistantText, actions);
  if (extraSuggestions) {
    state.suggestions = extraSuggestions;
    renderSuggestions();
  }
}

/* ------------------------------- Checkout -------------------------------- */

function renderCheckoutConfirm(host, action) {
  const plan = findPlan(action.plan) || {
    id: action.plan,
    name: action.planName || action.plan,
  };
  const interval = action.interval === "year" ? "year" : "month";
  const amount = Number(action.amount) || (interval === "year" ? plan.priceYearly : plan.price);
  const savedEmail = localStorage.getItem(EMAIL_KEY) || "";

  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>${escapeHtml(plan.name || action.planName)} subscription</h3>
        <p class="sub">Review and continue to Stripe's secure checkout.</p>
      </div>
      <span class="mini-tag">${interval === "year" ? "Annual" : "Monthly"}</span>
    </div>
    <div class="checkout-summary">
      <div class="summary-row"><span>Plan</span><strong>${escapeHtml(plan.name || action.planName)}</strong></div>
      <div class="summary-row"><span>Billing</span><strong>${interval === "year" ? "Annual · 12 months" : "Monthly · month to month"}</strong></div>
      <div class="summary-row total"><span>Due today</span><strong>${money(amount)}</strong></div>
    </div>
    <div class="field">
      <label for="checkout-email">Email for your receipt</label>
      <input id="checkout-email" type="email" inputmode="email" placeholder="you@yard.com" value="${escapeHtml(
        savedEmail,
      )}" autocomplete="email" />
    </div>
    <div class="plan-actions" style="margin-top:11px">
      <button class="btn btn-primary" type="button" data-checkout>Continue to secure Stripe checkout ${ICONS.arrow}</button>
      <button class="btn btn-ghost btn-sm" type="button" data-checkout-demo>I have a question first</button>
    </div>
    <p class="stripe-note">${ICONS.lock} Payments are processed by Stripe. Card details never touch Salvage Pulse servers.</p>
    <p class="form-error" data-checkout-error hidden></p>
    <p class="form-note" style="margin-top:8px">Need to add rep seats or multiple locations? Tell the team first so the subscription is set up correctly.</p>`;
  host.appendChild(card);

  const emailInput = card.querySelector("#checkout-email");
  const button = card.querySelector("[data-checkout]");
  const errorEl = card.querySelector("[data-checkout-error]");

  button.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    errorEl.hidden = true;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errorEl.textContent = "Please enter a valid email address.";
      errorEl.hidden = false;
      emailInput.focus();
      return;
    }
    if (email) localStorage.setItem(EMAIL_KEY, email);

    if (state.config && state.config.stripeEnabled === false) {
      button.disabled = true;
      button.textContent = "Stripe is not configured";
      errorEl.innerHTML = `Checkout is not connected in this preview. Email <a href="mailto:sales@salvagepulse.com">sales@salvagepulse.com</a> to complete the subscription.`;
      errorEl.hidden = false;
      return;
    }

    button.disabled = true;
    button.textContent = "Creating secure checkout…";
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: action.plan,
          interval,
          email,
          sessionId: state.sessionId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      button.textContent = "Redirecting to Stripe…";
      window.location.href = data.url;
    } catch (error) {
      button.disabled = false;
      button.innerHTML = `Continue to secure Stripe checkout ${ICONS.arrow}`;
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  });

  card.querySelector("[data-checkout-demo]").addEventListener("click", () => {
    addLocalExchange(
      "I have a question before checking out.",
      "Of course. Tell me what you need to know, or I can connect you with the team.",
    );
    renderSuggestions();
  });
}

function renderCheckoutLink(host, action) {
  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Secure checkout is ready</h3>
        <p class="sub">${escapeHtml(action.planName || "")} · ${action.interval === "year" ? "annual" : "monthly"}</p>
      </div>
      <span class="mini-tag">Stripe</span>
    </div>
    <a class="btn btn-primary" href="${escapeHtml(safeUrl(action.url))}">Continue to Stripe ${ICONS.arrow}</a>
    <p class="stripe-note">${ICONS.lock} You will finish on Stripe's hosted checkout. No card details are entered in this chat.</p>`;
  host.appendChild(card);
}

/* -------------------------------- Demo ---------------------------------- */

function demoFieldOptions() {
  return {
    phoneSystems: ["RingCentral", "VoIP / Cloud Phone", "Traditional PBX / Landline", "Other / Not Sure"],
    repSizes: [
      "1 to 3 Reps (Starter)",
      "4 to 10 Reps (Pro)",
      "11 to 50 Reps (Pro Platinum)",
      "50+ Reps (Enterprise)",
    ],
  };
}

function calcomUrl() {
  return state.config?.demo?.calcomUrl || "";
}

function openDemoBooking() {
  const url = calcomUrl();
  if (!url) {
    requestDemoForm();
    return;
  }
  addMessage("assistant", "Pick a time on the Cal.com booking page — it takes about 45 minutes, and the team will get the invite to you.", [
    { type: "calcom", url, durationMinutes: state.config?.demo?.durationMinutes || 45 },
  ]);
}

function renderCalcomCard(host, action) {
  const urlValue = action.url || calcomUrl();
  if (!urlValue) return;
  const url = safeUrl(urlValue);
  let embedUrl = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("embed", "true");
    parsed.searchParams.set("theme", "dark");
    parsed.searchParams.set("layout", "month_view");
    embedUrl = parsed.toString();
  } catch {
    embedUrl = url;
  }

  const card = document.createElement("div");
  card.className = "action-card cal-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Book a 1-on-1 yard demo</h3>
        <p class="sub">45 minutes · Cal.com · live call scoring tailored to your yard.</p>
      </div>
      <span class="mini-tag">Cal.com</span>
    </div>
    <div class="plan-actions">
      <a class="btn btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        Open Cal.com booking ${ICONS.arrow}
      </a>
      <button class="btn btn-ghost btn-sm" type="button" data-show-cal>Show available times here</button>
    </div>
    <p class="cal-fallback">If the calendar does not load, use the button above to open the booking page in a new tab.</p>
    <div data-cal-host></div>`;
  host.appendChild(card);

  card.querySelector("[data-show-cal]").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const hostEl = card.querySelector("[data-cal-host]");
    if (hostEl.querySelector("iframe")) {
      hostEl.innerHTML = "";
      button.textContent = "Show available times here";
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "cal-embed-wrap";
    const frame = document.createElement("iframe");
    frame.title = "Book a Salvage Pulse demo on Cal.com";
    frame.src = embedUrl.toString();
    frame.loading = "lazy";
    frame.setAttribute("allow", "camera; microphone; fullscreen; payment; clipboard-write");
    wrap.appendChild(frame);
    hostEl.appendChild(wrap);
    button.textContent = "Hide calendar";
    scrollToBottom();
  });
}

function valueText(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (Array.isArray(value)) return `${value.length} record${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 220);
  return String(value).slice(0, 400);
}

function renderAccountLoginCard(host, action) {
  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Connect your yard account</h3>
        <p class="sub">${escapeHtml(action.reason ? `To answer: ${action.reason}` : "See your plan, seats, callbacks, scores, and team.")}</p>
      </div>
      <span class="mini-tag">Secure</span>
    </div>
    <p class="form-note">You sign in with your app.salvagepulsepro.com credentials. The chatbot never stores your password, and account access is read-only.</p>
    <div class="plan-actions" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" type="button" data-connect-account>Connect account</button>
    </div>`;
  host.appendChild(card);
  card.querySelector("[data-connect-account]").addEventListener("click", openAccountModal);
}

function renderAccountSummaryCard(host, action) {
  const account = action.account || state.account;
  if (!account) {
    renderAccountLoginCard(host, { reason: "account overview" });
    return;
  }
  const user = account.user || {};
  const org = account.org || {};
  const rows = [
    ["Name", user.name],
    ["Role", user.title || user.role],
    ["Yard", org.name],
    ["Plan", org.plan_name],
    ["Status", org.status],
    ["Trial", org.days_left != null ? `${org.days_left} days left` : null],
    ["Rep seats", org.reps != null ? `${org.reps}${org.max_reps != null ? ` of ${org.max_reps}` : ""}` : null],
    ["Locations", org.sites_used != null ? `${org.sites_used}${org.max_sites != null ? ` of ${org.max_sites}` : ""}` : null],
    ["Billing", org.billing_interval ? (org.billing_interval === "year" ? "Annual" : "Monthly") : null],
    ["Access", org.access === false ? "Restricted" : "Active"],
  ].filter(([, value]) => value != null && value !== "");

  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>${escapeHtml(org.name || "Your account")}</h3>
        <p class="sub">${escapeHtml(user.name || "")}${user.email ? ` · ${escapeHtml(user.email)}` : ""}</p>
      </div>
      <span class="mini-tag">${escapeHtml(org.plan_name || "Account")}</span>
    </div>
    <div class="account-card-grid">
      ${rows
        .map(
          ([label, value]) =>
            `<div class="account-card-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
              String(value),
            )}</strong></div>`,
        )
        .join("")}
    </div>
    ${
      account.limited
        ? `<p class="account-card-note">Limited access: this account still uses its starting password. Set your own password in the Account panel to unlock call-level data.</p>`
        : ""
    }
    <div class="plan-actions">
      <button class="btn btn-primary btn-sm" type="button" data-account-ask>Ask Wheelie about my account</button>
      <button class="btn btn-ghost btn-sm" type="button" data-account-open>Open account panel</button>
    </div>`;
  host.appendChild(card);
  card.querySelector("[data-account-ask]").addEventListener("click", () => {
    sendMessage("Give me an overview of my account and anything I should know.");
  });
  card.querySelector("[data-account-open]").addEventListener("click", openAccountModal);
}

function renderAccountDataCard(host, action) {
  const data = action.data;
  if (data == null) return;
  const rows = [];

  const addObjectRows = (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value == null || typeof value === "object") {
        if (Array.isArray(value)) rows.push([key, `${value.length} record${value.length === 1 ? "" : "s"}`]);
        else if (value && typeof value === "object") rows.push([key, valueText(value)]);
        continue;
      }
      rows.push([key.replaceAll("_", " "), valueText(value)]);
    }
  };

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.callbacks)
      ? data.callbacks
      : Array.isArray(data.reps)
        ? data.reps
        : Array.isArray(data.items)
          ? data.items
          : null;

  if (list) {
    if (!list.length) {
      rows.push(["Result", "No records"]);
    } else if (typeof list[0] !== "object") {
      list.slice(0, 15).forEach((item, index) => rows.push([`#${index + 1}`, valueText(item)]));
    } else {
      const keys = [...new Set(list.slice(0, 5).flatMap((item) => Object.keys(item || {})))].slice(0, 7);
      list.slice(0, 12).forEach((item, index) => {
        const summary = keys
          .map((key) => `${key.replaceAll("_", " ")}: ${valueText(item?.[key])}`)
          .join(" · ");
        rows.push([`#${index + 1}`, summary]);
      });
    }
  } else if (typeof data === "object") {
    addObjectRows(data);
  } else {
    rows.push(["Result", valueText(data)]);
  }

  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>${escapeHtml(action.title || "Account data")}</h3>
        <p class="sub">Read-only data from app.salvagepulsepro.com.</p>
      </div>
      <span class="mini-tag">Account</span>
    </div>
    <div class="account-data-wrap">
      <table>
        <thead><tr><th>Field</th><th>Value</th></tr></thead>
        <tbody>
          ${rows
            .slice(0, 20)
            .map(
              ([label, value]) =>
                `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  host.appendChild(card);
}

function renderAccountLimitedCard(host) {
  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Unlock call-level data</h3>
        <p class="sub">The app is protecting this account until you replace its starting password.</p>
      </div>
      <span class="mini-tag">Action needed</span>
    </div>
    <p class="form-note">Set your own password (at least 8 characters) in the secure Account panel. It changes the password on app.salvagepulsepro.com and is never stored in this chat.</p>
    <div class="plan-actions" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" type="button" data-open-password>Set my password</button>
    </div>`;
  host.appendChild(card);
  card.querySelector("[data-open-password]").addEventListener("click", () => {
    openAccountModal({ focusPassword: true });
  });
}

async function requestDemoForm(prefill = {}) {  let slots = [];
  try {
    const response = await fetch("/api/demo/availability");
    if (response.ok) {
      const data = await response.json();
      slots = data.slots || [];
    }
  } catch {
    /* form can still show a fallback */
  }
  addMessage("assistant", "Pick a time that works and add your details — I'll confirm the demo and send a calendar invite.", [
    { type: "demo_form", slots, prefill },
  ]);
}

function renderDemoForm(host, action) {
  const card = document.createElement("div");
  card.className = "action-card form-card";
  host.appendChild(card);

  const prefill = action.prefill || {};
  const savedEmail = localStorage.getItem(EMAIL_KEY) || "";
  let slots = Array.isArray(action.slots) ? action.slots.slice() : [];
  let selected = null;

  const options = demoFieldOptions();

  const paint = () => {
    card.innerHTML = `
      <div class="action-head">
        <div>
          <h3>Book a 1-on-1 yard demo</h3>
          <p class="sub">45 minutes · Monday–Friday · live call scoring tailored to your yard.</p>
        </div>
        <span class="mini-tag">${ICONS.calendar.replace("<svg", "<svg style=\"vertical-align:-2px\"")} Demo</span>
      </div>
      <form class="form-card" novalidate>
        <div class="field-grid">
          <div class="field">
            <label for="demo-name">Full name *</label>
            <input id="demo-name" name="name" type="text" placeholder="John Doe" value="${escapeHtml(prefill.name || "")}" autocomplete="name" required />
          </div>
          <div class="field">
            <label for="demo-yard">Yard / business *</label>
            <input id="demo-yard" name="yard" type="text" placeholder="Tri-City Auto Recyclers" value="${escapeHtml(prefill.yard || "")}" autocomplete="organization" required />
          </div>
          <div class="field">
            <label for="demo-email">Business email *</label>
            <input id="demo-email" name="email" type="email" inputmode="email" placeholder="john@tricityauto.com" value="${escapeHtml(prefill.email || savedEmail)}" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="demo-phone">Phone *</label>
            <input id="demo-phone" name="phone" type="tel" inputmode="tel" placeholder="(555) 987-6543" value="${escapeHtml(prefill.phone || "")}" autocomplete="tel" required />
          </div>
          <div class="field">
            <label for="demo-phonesys">Current phone system</label>
            <select id="demo-phonesys" name="phoneSystem">
              ${options.phoneSystems
                .map(
                  (value) =>
                    `<option value="${escapeHtml(value)}" ${
                      prefill.phoneSystem === value ? "selected" : ""
                    }>${escapeHtml(value)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="demo-reps">Sales counter size</label>
            <select id="demo-reps" name="reps">
              ${options.repSizes
                .map(
                  (value) =>
                    `<option value="${escapeHtml(value)}" ${
                      prefill.reps === value ? "selected" : ""
                    }>${escapeHtml(value)}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div class="slot-label">Pick a time (${escapeHtml(state.config?.demo?.timezoneLabel || "ET")})</div>
        <div class="slot-grid" data-slots>
          ${
            slots.length
              ? slots
                  .map(
                    (slot) => `
                    <button type="button" class="slot" data-date="${escapeHtml(slot.date)}" data-time="${escapeHtml(
                      slot.time,
                    )}">
                      <span class="slot-day">${escapeHtml(slot.dayLabel || slot.label || slot.date)}</span>
                      <span class="slot-time">${escapeHtml(slot.timeLabel || slot.time)}</span>
                    </button>`,
                  )
                  .join("")
              : `<p class="form-note" style="grid-column:1/-1">No open times in the next three weeks. Email <a href="mailto:sales@salvagepulse.com">sales@salvagepulse.com</a> and the team will find a slot.</p>`
          }
        </div>

        <div class="field">
          <label for="demo-notes">Anything we should know? <span style="color:#5b7392">(optional)</span></label>
          <textarea id="demo-notes" name="notes" placeholder="Call volume, parts focus, multi-location, current CRM, etc.">${escapeHtml(
            prefill.notes || "",
          )}</textarea>
        </div>

        <button class="btn btn-primary" type="submit" data-submit>Confirm demo booking</button>
        <p class="form-error" data-error hidden></p>
        <p class="form-note">A calendar invite is generated instantly. We'll email a Google Meet link before the demo.</p>
        ${
          state.config?.demo?.calendlyUrl || state.config?.demo?.calcomUrl
            ? `<p class="form-note">Prefer another calendar tool? <a href="${escapeHtml(
                state.config.demo.calendlyUrl || state.config.demo.calcomUrl,
              )}" target="_blank" rel="noreferrer">Pick a time there</a>.</p>`
            : ""
        }
      </form>`;

    card.querySelectorAll(".slot").forEach((button) => {
      button.addEventListener("click", () => {
        selected = {
          date: button.dataset.date,
          time: button.dataset.time,
          label: `${button.querySelector(".slot-day")?.textContent || button.dataset.date} · ${
            button.querySelector(".slot-time")?.textContent || button.dataset.time
          }`,
        };
        card.querySelectorAll(".slot").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
      });
    });

    const form = card.querySelector("form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorEl = card.querySelector("[data-error]");
      const submit = card.querySelector("[data-submit]");
      errorEl.hidden = true;

      const data = Object.fromEntries(new FormData(form).entries());
      data.name = String(data.name || "").trim();
      data.yard = String(data.yard || "").trim();
      data.email = String(data.email || "").trim();
      data.phone = String(data.phone || "").trim();

      const errors = [];
      if (!data.name) errors.push("your full name");
      if (!data.yard) errors.push("your yard name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.push("a valid business email");
      if (String(data.phone).replace(/\D/g, "").length < 10) errors.push("a phone number");
      if (!selected) errors.push("a demo time");

      if (errors.length) {
        errorEl.textContent = `Please add ${errors.join(", ")}.`;
        errorEl.hidden = false;
        return;
      }

      if (data.email) localStorage.setItem(EMAIL_KEY, data.email);

      submit.disabled = true;
      submit.textContent = "Confirming your slot…";

      try {
        const response = await fetch("/api/demo/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            date: selected.date,
            time: selected.time,
            source: "chatbot-widget",
            sessionId: state.sessionId,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not book that slot.");

        const demo = result.demo;
        state.history.push({
          role: "assistant",
          content: `Demo confirmed for ${demo.name} at ${demo.yard} on ${selected.label}. Confirmation ID ${demo.id}.`,
        });

        card.innerHTML = `
          <div class="confirm-strip">${ICONS.check}<div><strong>Demo confirmed.</strong> ${escapeHtml(
            selected.label,
          )} · ${escapeHtml(demo.yard)}</div></div>
          <p class="form-note" style="margin-top:10px">${
            result.emailSent
              ? "A confirmation email is on its way."
              : "Your slot is saved. The team will follow up with the calendar invite."
          }</p>
          <div class="plan-actions" style="margin-top:10px">
            <a class="btn btn-ghost btn-sm" href="${escapeHtml(safeUrl(result.icsUrl))}">${ICONS.calendar} Add to calendar (.ics)</a>
            <button class="btn btn-primary btn-sm" type="button" data-book-another>Book another time</button>
          </div>
          <p class="form-note" style="margin-top:8px">Need to move it? Email <a href="mailto:sales@salvagepulse.com">sales@salvagepulse.com</a> with your confirmation ID.</p>`;

        card.querySelector("[data-book-another]")?.addEventListener("click", () => {
          requestDemoForm({ name: data.name, yard: data.yard, email: data.email, phone: data.phone });
        });
        showToast("Demo booked — check your inbox for the invite.");
        scrollToBottom();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = "Confirm demo booking";
        errorEl.textContent = error.message;
        errorEl.hidden = false;
        if (/slot/i.test(error.message)) {
          try {
            const response = await fetch("/api/demo/availability");
            if (response.ok) {
              const availability = await response.json();
              slots = availability.slots || [];
              selected = null;
              paint();
            }
          } catch {
            /* keep the original form */
          }
        }
      }
    });
  };

  if (slots.length) {
    paint();
    return;
  }

  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>Book a 1-on-1 yard demo</h3>
        <p class="sub">45 minutes · Monday–Friday · live call scoring tailored to your yard.</p>
      </div>
      <span class="mini-tag">Demo</span>
    </div>
    <p class="form-note">Loading the next available times…</p>`;

  fetch("/api/demo/availability")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      slots = data?.slots || [];
      if (card.isConnected) paint();
    })
    .catch(() => {
      if (card.isConnected) paint();
    });
}

function renderDemoConfirmed(host, action) {
  const demo = action.demo || {};
  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="confirm-strip">${ICONS.check}<div><strong>Demo confirmed.</strong> ${escapeHtml(
      demo.yard || "",
    )} · ${escapeHtml(demo.date || "")} ${escapeHtml(demo.time || "")}</div></div>
    <div class="checkout-summary" style="margin-top:10px">
      <div class="summary-row"><span>Contact</span><strong>${escapeHtml(demo.name || "")}</strong></div>
      <div class="summary-row"><span>Email</span><strong>${escapeHtml(demo.email || "")}</strong></div>
      <div class="summary-row"><span>Confirmation</span><strong>${escapeHtml(demo.id || "")}</strong></div>
    </div>
    <a class="btn btn-ghost btn-sm" href="${escapeHtml(safeUrl(action.icsUrl || "#"))}">${ICONS.calendar} Add to calendar (.ics)</a>`;
  host.appendChild(card);
}

/* ------------------------------- Contact --------------------------------- */

function renderContactForm(host, action) {
  const department = action.department === "support" ? "support" : "sales";
  const email = department === "support" ? "support@salvagepulse.com" : "sales@salvagepulse.com";
  const savedEmail = localStorage.getItem(EMAIL_KEY) || "";
  const uid = `contact-${++formSeq}`;

  const card = document.createElement("div");
  card.className = "action-card form-card";
  card.innerHTML = `
    <div class="action-head">
      <div>
        <h3>${department === "support" ? "Talk to yard support" : "Talk to the sales team"}</h3>
        <p class="sub">${department === "support" ? "Console access, rep seats, or score questions." : "Custom quotes, trials, multi-location groups, or procurement."}</p>
      </div>
      <span class="mini-tag">${department === "support" ? "Support" : "Sales"}</span>
    </div>
    ${
      action.reason
        ? `<p class="form-note" style="margin-bottom:2px">Reason: ${escapeHtml(action.reason)}</p>`
        : ""
    }
    <form class="form-card" novalidate>
      <div class="field-grid">
        <div class="field">
          <label for="${uid}-name">Name *</label>
          <input id="${uid}-name" name="name" type="text" placeholder="Marcus Vance" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="${uid}-email">Email *</label>
          <input id="${uid}-email" name="email" type="email" inputmode="email" placeholder="marcus@acmeauto.com" value="${escapeHtml(
            savedEmail,
          )}" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="${uid}-yard">Yard / company</label>
          <input id="${uid}-yard" name="yard" type="text" placeholder="Acme Auto Recyclers" autocomplete="organization" />
        </div>
        <div class="field">
          <label for="${uid}-phone">Phone</label>
          <input id="${uid}-phone" name="phone" type="tel" inputmode="tel" placeholder="(555) 234-5678" autocomplete="tel" />
        </div>
      </div>
      <div class="field">
        <label for="${uid}-message">How can we help? *</label>
        <textarea id="${uid}-message" name="message" placeholder="Tell us about your phone system, rep count, and what you need." required></textarea>
      </div>
      <button class="btn btn-primary" type="submit" data-submit>Send message to ${department === "support" ? "support" : "sales"}</button>
      <p class="form-error" data-error hidden></p>
      <p class="form-note">Prefer email? Reach us at <a href="mailto:${email}">${email}</a>. Never include a password or card number.</p>
    </form>`;
  host.appendChild(card);

  const form = card.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = card.querySelector("[data-error]");
    const submit = card.querySelector("[data-submit]");
    errorEl.hidden = true;

    const data = Object.fromEntries(new FormData(form).entries());
    data.department = department;
    data.topic = action.reason || (department === "support" ? "Yard support" : "Website inquiry");

    if (!String(data.name || "").trim()) {
      errorEl.textContent = "Please add your name.";
      errorEl.hidden = false;
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || "").trim())) {
      errorEl.textContent = "Please add a valid email.";
      errorEl.hidden = false;
      return;
    }
    if (String(data.message || "").trim().length < 5) {
      errorEl.textContent = "Please add a short message.";
      errorEl.hidden = false;
      return;
    }

    if (data.email) localStorage.setItem(EMAIL_KEY, data.email);

    submit.disabled = true;
    submit.textContent = "Sending…";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the message.");

      card.innerHTML = `
        <div class="confirm-strip">${ICONS.check}<div><strong>Message sent.</strong> The ${department} team will reply by email.</div></div>
        <p class="form-note" style="margin-top:10px">For anything urgent, email <a href="mailto:${email}">${email}</a>.</p>`;
      showToast("Message sent to the team.");
      scrollToBottom();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = `Send message to ${department}`;
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  });
}

/* --------------------------------- Links --------------------------------- */

function renderLinks(host, action) {
  const card = document.createElement("div");
  card.className = "action-card";
  card.innerHTML = `
    <div class="link-list">
      ${(action.links || [])
        .map(
          (link) =>
            `<a class="btn btn-ghost btn-sm" href="${escapeHtml(safeUrl(link.url))}" ${
              link.url.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""
            }>${escapeHtml(link.label)}</a>`,
        )
        .join("")}
    </div>`;
  host.appendChild(card);
}

/* -------------------------------- Composer ------------------------------- */

function autoGrow() {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

async function sendMessage(text) {
  const message = String(text || "").trim();
  if (!message || state.sending) return;

  state.sending = true;
  sendBtn.disabled = true;
  suggestionsEl.innerHTML = "";

  state.history.push({ role: "user", content: message });
  addMessage("user", message);
  addTyping();

  state.history = state.history.slice(-16);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: state.history.slice(0, -1).slice(-14),
        sessionId: state.sessionId,
        page: "site",
        accountToken: state.accountToken || "",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The assistant could not respond.");

    removeTyping();

    if (data.sessionId) {
      state.sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, state.sessionId);
    }

    if (data.account) {
      state.account = data.account;
      updateAccountButton();
    }

    const reply = data.reply || "I'm not sure how to answer that yet. I can connect you with the team.";
    state.history.push({ role: "assistant", content: reply });
    state.history = state.history.slice(-16);
    addMessage("assistant", reply, data.actions || []);

    state.suggestions = Array.isArray(data.suggestions) && data.suggestions.length ? data.suggestions : DEFAULT_SUGGESTIONS;
    state.retryMessage = "";
    renderSuggestions();
    persistTranscript();
  } catch (error) {
    removeTyping();
    const reply =
      "I hit a snag on that one. Please try again, or email sales@salvagepulse.com and the team will jump in.";
    state.history.push({ role: "assistant", content: reply });
    addMessage("assistant", reply, [
      { type: "contact_form", department: "sales", reason: error.message },
    ]);
    state.suggestions = ["Try again", "Contact sales", "Book a demo"];
    state.retryMessage = message;
    renderSuggestions();
    showToast(error.message || "Connection issue");
  } finally {
    state.sending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function newChat() {
  state.sessionId = `web_${crypto.randomUUID().slice(0, 12)}`;
  localStorage.setItem(SESSION_KEY, state.sessionId);
  state.history = [];
  state.transcript = [];
  state.suggestions = DEFAULT_SUGGESTIONS;
  state.retryMessage = "";
  messagesEl.innerHTML = "";
  localStorage.removeItem(STORAGE_KEY);
  addMessage(
    "assistant",
    "Fresh start. I can help with product questions, plan fit, demo scheduling, subscriptions, or account access. What do you need?",
  );
  renderSuggestions();
  showToast("Started a new chat");
}

/* -------------------------------- Account -------------------------------- */

const accountModal = document.getElementById("account-modal");
const accountContent = document.getElementById("account-content");
const accountBtn = document.getElementById("account-btn");
const accountAvatar = document.getElementById("account-avatar");
const accountLabel = document.getElementById("account-label");
const accountDot = document.getElementById("account-dot");

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "Y";
}

function updateAccountButton() {
  if (!accountBtn) return;
  const account = state.account;
  const connected = Boolean(account);
  accountBtn.classList.toggle("connected", connected);
  accountDot.hidden = !connected;
  accountBtn.title = connected
    ? `${account.org?.name || account.user?.name || "Yard account"} — manage account`
    : "Connect your yard account";
  accountBtn.setAttribute(
    "aria-label",
    connected ? `${account.org?.name || "Yard account"} account settings` : "Connect your yard account",
  );
  if (accountAvatar) {
    accountAvatar.innerHTML = connected
      ? escapeHtml(initials(account.user?.name))
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c.6-3.5 3.2-5.4 7-5.4s6.4 1.9 7 5.4"/></svg>`;
  }
  if (accountLabel && !state.embed) {
    accountLabel.textContent = connected ? account.org?.name || "Account" : "Account";
  }
}

function accountRows(account) {
  const user = account.user || {};
  const org = account.org || {};
  return [
    ["Name", user.name],
    ["Role", user.title || user.role],
    ["Email", user.email],
    ["Yard", org.name],
    ["Plan", org.plan_name],
    ["Status", org.status],
    ["Trial", org.days_left != null ? `${org.days_left} days left` : null],
    ["Rep seats", org.reps != null ? `${org.reps}${org.max_reps != null ? ` of ${org.max_reps}` : ""}` : null],
    ["Locations", org.sites_used != null ? `${org.sites_used}${org.max_sites != null ? ` of ${org.max_sites}` : ""}` : null],
    ["Billing", org.billing_interval ? (org.billing_interval === "year" ? "Annual" : "Monthly") : null],
    ["Access", org.access === false ? "Restricted" : "Active"],
  ].filter(([, value]) => value != null && value !== "");
}

function renderLoginView(error = "") {
  if (!accountContent) return;
  accountContent.innerHTML = `
    <div class="account-modal-head">
      <p class="eyebrow">ACCOUNT-AWARE ANSWERS</p>
      <h3 id="account-modal-title">Connect your yard account</h3>
      <p>Sign in with your <a href="https://app.salvagepulsepro.com/login" target="_blank" rel="noreferrer">Salvage Pulse app</a> email and password. Wheelie can then answer questions about your plan, seats, callbacks, scores, and team.</p>
    </div>
    <div class="account-pill-row">
      <span class="account-pill">Read-only</span>
      <span class="account-pill">Password never stored</span>
      <span class="account-pill">Session expires</span>
    </div>
    <form class="account-password-form" id="account-login-form" novalidate>
      <div class="field">
        <label for="account-email">Work email</label>
        <input id="account-email" name="email" type="email" inputmode="email" autocomplete="username" placeholder="you@yard.com" required />
      </div>
      <div class="field">
        <label for="account-password">Password</label>
        <input id="account-password" name="password" type="password" autocomplete="current-password" placeholder="Your app password" required />
      </div>
      <button class="btn btn-primary" type="submit" data-login-submit>Connect account</button>
      <p class="form-error" data-account-error ${error ? "" : "hidden"}>${escapeHtml(error)}</p>
    </form>
    <hr class="account-divider" />
    <p class="account-small">We send your password directly to app.salvagepulsepro.com to create a session. It is not stored in the browser, chat history, or logs. Account data is read-only. <a href="https://app.salvagepulsepro.com/forgot-password" target="_blank" rel="noreferrer">Forgot password?</a></p>`;

  const form = accountContent.querySelector("#account-login-form");
  const errorEl = accountContent.querySelector("[data-account-error]");
  const submit = accountContent.querySelector("[data-login-submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const email = form.querySelector("#account-email").value.trim();
    const password = form.querySelector("#account-password").value;
    if (!email || !password) {
      errorEl.textContent = "Enter your email and password.";
      errorEl.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Connecting…";
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not connect that account.");

      state.accountToken = data.token;
      state.account = data.account;
      sessionStorage.setItem(ACCOUNT_KEY, data.token);
      form.querySelector("#account-password").value = "";
      updateAccountButton();
      renderAccountView();
      showToast(
        data.account?.limited
          ? "Account connected — limited access until you set your own password."
          : "Account connected.",
      );
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Connect account";
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  });

  setTimeout(() => accountContent.querySelector("#account-email")?.focus(), 30);
}

function renderPasswordView() {
  if (!accountContent) return;
  const account = state.account || {};
  const user = account.user || {};
  accountContent.innerHTML = `
    <div class="account-modal-head">
      <p class="eyebrow">ONE-TIME PASSWORD CHANGE</p>
      <h3 id="account-modal-title">Set your own password</h3>
      <p>${escapeHtml(user.name || "This account")} is still using its starting password, so the app blocks call-level data. Set a new password here to unlock your scores, callbacks, and team.</p>
    </div>
    <div class="account-note">
      This changes the password on <strong>app.salvagepulsepro.com</strong>. The starting password will stop working. Save the new password in your password manager — Wheelie does not store it.
    </div>
    <form class="account-password-form" id="account-password-form" novalidate>
      <div class="field">
        <label for="pw-current">Current (starting) password</label>
        <input id="pw-current" name="current" type="password" autocomplete="current-password" required />
      </div>
      <div class="field">
        <label for="pw-new">New password</label>
        <input id="pw-new" name="new" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="field">
        <label for="pw-confirm">Repeat new password</label>
        <input id="pw-confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <button class="btn btn-primary" type="submit" data-password-submit>Set new password</button>
      <p class="form-error" data-password-error hidden></p>
    </form>
    <hr class="account-divider" />
    <div class="account-actions">
      <button class="btn btn-ghost btn-sm" type="button" data-back-account>Back to account</button>
    </div>`;

  const form = accountContent.querySelector("#account-password-form");
  const errorEl = accountContent.querySelector("[data-password-error]");
  const submit = accountContent.querySelector("[data-password-submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const current = form.querySelector("#pw-current").value;
    const next = form.querySelector("#pw-new").value;
    const confirm = form.querySelector("#pw-confirm").value;

    if (next.length < 8) {
      errorEl.textContent = "Use at least 8 characters.";
      errorEl.hidden = false;
      return;
    }
    if (next !== confirm) {
      errorEl.textContent = "The new passwords do not match.";
      errorEl.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Updating password…";
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.accountToken}`,
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not change the password.");

      state.account = data.account;
      updateAccountButton();
      renderAccountView();
      showToast("Password changed. Save it in your password manager.");
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Set new password";
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  });

  accountContent.querySelector("[data-back-account]").addEventListener("click", () => renderAccountView());
  setTimeout(() => accountContent.querySelector("#pw-current")?.focus(), 30);
}

function renderAccountView() {
  if (!accountContent) return;
  const account = state.account;
  if (!account) {
    renderLoginView();
    return;
  }
  const user = account.user || {};
  const org = account.org || {};

  accountContent.innerHTML = `
    <div class="account-modal-head">
      <p class="eyebrow">CONNECTED ACCOUNT</p>
      <h3 id="account-modal-title">${escapeHtml(org.name || "Your yard")}</h3>
      <p>${escapeHtml(user.name || "")}${user.title ? ` · ${escapeHtml(user.title)}` : ""}</p>
    </div>
    <div class="account-pill-row">
      <span class="account-pill green">Connected</span>
      <span class="account-pill">Read-only</span>
      ${account.limited ? '<span class="account-pill amber">Limited access</span>' : '<span class="account-pill">Full data</span>'}
    </div>
    <div class="account-card-grid">
      ${accountRows(account)
        .map(
          ([label, value]) =>
            `<div class="account-card-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
              String(value),
            )}</strong></div>`,
        )
        .join("")}
    </div>
    ${
      account.limited
        ? `<div class="account-note">This account still uses its starting password. Account basics work, but the app blocks call-level data. Set your own password to unlock scores, callbacks, and team data.</div>`
        : ""
    }
    <div class="account-actions">
      <button class="btn btn-primary" type="button" data-account-ask>Ask Wheelie about my account</button>
      ${account.limited ? '<button class="btn btn-ghost btn-sm" type="button" data-account-password>Set my password</button>' : ""}
      <button class="btn btn-ghost btn-sm" type="button" data-account-disconnect>Disconnect account</button>
    </div>
    <p class="account-small" style="margin-top:10px">Try: “What plan am I on?”, “Show my open callbacks”, “What’s my QA score?”, or “How many reps do I have?”</p>`;

  accountContent.querySelector("[data-account-ask]").addEventListener("click", () => {
    closeAccountModal();
    sendMessage("Give me an overview of my account and anything I should know.");
  });
  accountContent.querySelector("[data-account-password]")?.addEventListener("click", renderPasswordView);
  accountContent.querySelector("[data-account-disconnect]").addEventListener("click", async () => {
    const token = state.accountToken;
    state.accountToken = "";
    state.account = null;
    sessionStorage.removeItem(ACCOUNT_KEY);
    updateAccountButton();
    renderLoginView();
    if (token) {
      fetch("/api/account/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    showToast("Account disconnected.");
  });
}

function openAccountModal({ focusPassword = false } = {}) {
  if (!accountModal || !accountContent) return;
  accountModal.hidden = false;
  document.body.classList.add("modal-open");
  if (focusPassword && state.account?.limited) renderPasswordView();
  else renderAccountView();
}

function closeAccountModal() {
  if (!accountModal) return;
  accountModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function loadAccount() {
  if (!state.accountToken) {
    updateAccountButton();
    return;
  }
  try {
    const response = await fetch("/api/account/summary", {
      headers: { Authorization: `Bearer ${state.accountToken}` },
    });
    if (!response.ok) throw new Error("expired");
    const data = await response.json();
    state.account = data.account;
  } catch {
    state.accountToken = "";
    state.account = null;
    sessionStorage.removeItem(ACCOUNT_KEY);
  }
  updateAccountButton();
}

function setupAccount() {
  if (!accountBtn || !accountModal) return;
  accountBtn.addEventListener("click", () => openAccountModal());
  document.getElementById("account-modal-close")?.addEventListener("click", closeAccountModal);
  accountModal.addEventListener("click", (event) => {
    if (event.target === accountModal) closeAccountModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountModal.hidden) closeAccountModal();
  });
  updateAccountButton();
  loadAccount();
}

/* --------------------------------- Embed --------------------------------- */

function setupEmbed() {
  if (!state.embed) return;
  document.body.classList.add("embed");

  const header = $(".chat-header");
  const newChatButton = $("#new-chat");
  const actions = newChatButton?.parentElement;
  if (!header || !newChatButton || !actions) return;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.setAttribute("aria-label", "Close chat");
  close.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  close.addEventListener("click", () => {
    window.parent?.postMessage({ type: "sp-chat-close" }, "*");
  });

  // Escape closes the widget, unless the account dialog is open.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const modal = document.getElementById("account-modal");
    if (modal && !modal.hidden) return;
    window.parent?.postMessage({ type: "sp-chat-close" }, "*");
  });
  actions.insertBefore(close, newChatButton);

  // Keep the iframe height sensible when the on-screen keyboard opens.
  window.addEventListener("resize", () => {
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
  });
}

/* --------------------------------- Boot ---------------------------------- */

async function boot() {
  if (!messagesEl || !composer) return;

  setupEmbed();
  setupAccount();

  const [configResult, plansResult] = await Promise.allSettled([
    fetch("/api/config").then((response) => (response.ok ? response.json() : null)),
    fetch("/api/plans").then((response) => (response.ok ? response.json() : null)),
  ]);

  if (configResult.status === "fulfilled" && configResult.value) state.config = configResult.value;
  if (plansResult.status === "fulfilled" && plansResult.value?.plans) state.plans = plansResult.value.plans;

  const restored = restoreTranscript();
  if (!restored) {
    addMessage(
      "assistant",
      "Hey — I'm **Wheelie**, the Salvage Pulse assistant. I can explain how the platform works, help you pick the right plan, book a 1-on-1 yard demo, or connect to your yard account for account-specific answers.\n\nWhat are you trying to solve at your yard?",
    );
    state.transcript = state.transcript.slice(-39);
  }

  renderSuggestions();
  input.focus();
  scrollToBottom();
}

composer?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = "";
  autoGrow();
  sendMessage(text);
});

input?.addEventListener("input", autoGrow);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

sendBtn?.addEventListener("click", () => {
  if (!state.sending) composer.requestSubmit();
});

$("#new-chat")?.addEventListener("click", newChat);

boot();
