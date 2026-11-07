/**
 * Curated knowledge base for the Salvage Pulse chatbot.
 *
 * Sources: site.salvagepulsepro.com (marketing copy, pricing, demo form) and
 * app.salvagepulsepro.com (public product structure, plan catalogue, scoring
 * rubric). Keep claims conservative; route anything unverified to the team.
 */

export const plans = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For independent yards getting every call scored.",
    price: 99,
    priceYearly: 1089,
    maxReps: 3,
    popular: false,
    features: [
      "Up to 3 rep logins",
      "Call scoring & categories",
      "RingCentral + webhook connectors",
      "Customer & win-back lists",
      "Daily opportunity emails",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing counters that want AI role-play and daily follow-up queues.",
    price: 249,
    priceYearly: 2739,
    maxReps: 5,
    popular: true,
    features: [
      "5 rep logins included",
      "Extra reps: +2 for $50/mo, up to $400/mo total",
      "Everything in Starter",
      "AI role-play trainer",
      "Daily follow-up email",
      "Vehicle arrivals & call queue",
      "Rep performance console",
    ],
  },
  {
    id: "pro_unlimited",
    name: "Pro Platinum",
    tagline: "For high-volume call centers and busy regional yards.",
    price: 499,
    priceYearly: 5489,
    maxReps: 50,
    popular: false,
    features: [
      "Up to 50 rep logins",
      "Everything in Pro",
      "Yard champion leaderboards",
      "Advanced sentiment analytics",
      "Priority onboarding support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Multi-location intelligence, demand planning, and buying signals.",
    price: 649,
    priceYearly: 7139,
    maxReps: 75,
    popular: false,
    features: [
      "Every tool included",
      "Up to 75 rep logins",
      "2 locations",
      "Monthly trends & seasonal parts insights",
      "Vehicle demand, stock alerts & watchlists",
      "Custom ERP / Hollander sync",
      "Priority setup & support",
    ],
  },
  {
    id: "enterprise_platinum",
    name: "Enterprise Platinum",
    tagline: "Total command for leading recycler groups.",
    price: 1149,
    priceYearly: 12639,
    maxReps: null,
    popular: false,
    features: [
      "Unlimited rep logins",
      "Up to 4 locations (+$100/mo per extra location)",
      "Everything in Enterprise",
      "Dedicated director & custom SLA",
      "Priority 24/7 technical setup",
      "Custom ERP / Hollander sync",
    ],
  },
];

export const coreFacts = `
COMPANY
- The website assistant is named Wheelie.
- Salvage Pulse is call intelligence, sales coaching, and yard inventory intelligence built specifically for automotive dismantlers / auto recyclers.
- Made by recyclers, for recyclers. The founding family has 20+ years of hands-on automotive recycling experience.
- Website: https://site.salvagepulsepro.com/ · App login: https://app.salvagepulsepro.com/login
- Demo booking: https://cal.com/gen-keech-avipdc/live-demo (1-on-1, about 45 minutes)
- Sales: sales@salvagepulse.com · Support: support@salvagepulse.com
- Sales counter reps, managers, owners, and multi-location recycler groups use it.

WHAT IT DOES
- Ingests sales calls from RingCentral, VoIP/cloud phone systems, webhooks, or uploaded audio.
- Transcribes automotive speech (Hollander interchange, VINs, engines, trims, core deposits, salvage terminology).
- Scores every call against a 7-metric rubric and categorizes it.
- Gives reps an AI role-play trainer and managers a performance console.
- Builds callback queues, win-back lists, vehicle arrival matches, and demand signals for auction buying.

PLANS (USD, per month unless annual)
- Starter $99/mo or $1,089/yr · up to 3 rep logins.
- Pro $249/mo or $2,739/yr · 5 rep logins included; extra reps +2 for $50/mo, up to $400/mo total.
- Pro Platinum $499/mo or $5,489/yr · up to 50 rep logins.
- Enterprise $649/mo or $7,139/yr · up to 75 rep logins, 2 locations, demand/stock intelligence, ERP/Hollander sync.
- Enterprise Platinum $1,149/mo or $12,639/yr · unlimited reps, up to 4 locations (+$100/mo per extra), custom SLA, dedicated director.
- Annual billing is 11 months' price for 12 months (one month free).
- 1-day free trial, no credit card required. Enterprise trials can be requested.

STRICT RULES
- Never invent features, prices, discounts, certifications, refund terms, SLAs, or security claims.
- Never share or ask for passwords. Never collect full card numbers; payments are completed on Stripe's hosted checkout.
- Do not promise specific revenue results. ROI figures are estimates.
- If a question is not covered, say so and offer sales@salvagepulse.com or a demo.
- Keep answers concise (usually 2-6 short sentences or a short list). Ask one clarifying question when needed.
- Use a helpful, confident, yard-savvy tone. No hype.
`.trim();

export const sections = [
  {
    id: "overview",
    title: "What Salvage Pulse is",
    keywords: ["what", "product", "overview", "do", "platform", "software", "about", "solve", "problem", "why"],
    content: `Salvage Pulse is a data-driven call intelligence and yard intelligence platform purpose-built for automotive dismantlers. It turns recorded sales calls into structured data: transcripts, 7-metric QA scores, call categories, customer and vehicle matches, callback queues, coaching plans, and demand signals for auction buying.

The core promise is simple: stop leaving salvage revenue on the counter. Generic CRMs do not understand Hollander interchange, core returns, OEM used parts, or the speed of a recycler sales desk. Salvage Pulse does.

It is used by counter reps, sales managers, yard owners, inventory managers, and multi-location recycler groups.`,
  },
  {
    id: "how-it-works",
    title: "How it works — four steps",
    keywords: ["how", "works", "setup", "onboarding", "connect", "ringcentral", "voip", "webhook", "install", "hardware", "minutes", "steps"],
    content: `1. Ingest audio & scripts — connect RingCentral, a VoIP/cloud phone provider, or audio recordings via secure webhooks. No expensive hardware and no interruption to counter dispatch.
2. Automotive speech NLP — transcription tuned for dismantlers: Hollander numbers, VINs, engine trims, core deposits, part grades, and salvage vernacular.
3. 7-metric QA rubric — every call is scored across seven weighted metrics and categorized as Part Inquiry/Quote, Price Negotiation, Order/Sale, Shipping, Warranty, Core Return, and related categories.
4. Automate yard execution — scores feed rep follow-up queues, vehicle arrival alerts, targeted AI role-play drills, coaching flags, and lost-part demand intelligence.

Typical phone connection is under 15 minutes. RingCentral is the primary native integration. Other cloud phone systems can use webhooks or audio upload/import. Traditional PBX/landline setups may need a recording/export workflow; the team confirms the best path during a demo.`,
  },
  {
    id: "scoring",
    title: "The 7-metric call scoring rubric",
    keywords: ["score", "scoring", "rubric", "metrics", "qa", "grade", "weights", "greeting", "discovery", "knowledge", "upsell", "objection", "closing", "courtesy"],
    content: `Every call is scored 0–100 across seven weighted metrics:
- Greeting & Brand — 10% — yard identification, rep name, warm professional tone.
- Needs Discovery — 15% — VIN or Hollander interchange, year/make/model, engine, transmission, trim, mileage expectations.
- Product Knowledge — 15% — interchange accuracy, part grade/condition, bench/run-test notes, donor mileage, included components, warranty terms.
- Upsell & Cross-sell — 15% — companion parts (gaskets, seals, hardware, fluids, harnesses, brackets), extended warranty, bundles, core incentives.
- Objection Handling — 15% — price pushback, OEM used vs. cheap aftermarket, delivery/lead-time concerns.
- Closing & Next Steps — 15% — asks for the sale/deposit, confirms pickup or freight, invoice details, follow-up expectations.
- Courtesy & Professionalism — 15% — active listening, clean phone etiquette, courteous hold times, clear language, thanks the caller.

Calls are also categorized (e.g., Sales Inquiry, Warranty/Return, Order/Sale, Delivery, Return Call) so managers can filter and coach by scenario.`,
  },
  {
    id: "console",
    title: "Console, analytics, and manager tools",
    keywords: ["console", "dashboard", "analytics", "reports", "manager", "owner", "team", "performance", "leaderboard", "call library", "transcript", "coaching", "queue", "callbacks"],
    content: `Managers and owners get a Team Dashboard, Call Library, Callbacks, Reps, Vehicles & Stock, Tag Vehicles, Reports, Leaderboards, Shift Calendar, Keyword Tracker, Role-Play Trainer, and Settings.

What they can do:
- Monitor yard-wide closing rates, QA scores, call volume, and coaching flags.
- Open any call to read the transcript, listen to audio, review the score breakdown, and see category and customer/vehicle matches.
- Build callback lists, assign follow-ups, and work a daily action queue.
- Compare reps, track score trends, and spot metric-level coaching gaps.
- Track keywords and caller topics, including parts and vehicles that callers ask for but the yard does not have.

Reps get a personal view: My Performance, My Calls, Callbacks, Vehicle Arrivals, Tag Vehicles, Reports, Leaderboards, Role-Play Trainer, and Settings. Reps see their own call makeup, scores, skill radar, and coaching recommendations — not the whole team's private data.
Inventory managers get Vehicles & Stock, Yard Dashboard, Call Library, Shift Calendar, and Settings.`,
  },
  {
    id: "roleplay",
    title: "AI Role-Play Trainer",
    keywords: ["roleplay", "role-play", "practice", "training", "coach", "rehearsal", "objection", "scenario", "ai customer", "mic", "voice"],
    content: `The AI Role-Play Trainer lets counter reps rehearse real salvage scenarios against an interactive customer AI that responds in real time. Example scenarios include a price objection on an OEM tailgate, an interchange/out-of-stock question, and a core-charge or return-policy hesitation.

After each rehearsal, the rep gets an instant score, metric-level feedback, and an AI coach insight. Managers can assign scenarios and track completion on the Role-Play Scoreboard. Reps can practice by text or microphone.

This is included from the Pro plan up.`,
  },
  {
    id: "demand",
    title: "Demand Radar and auction intelligence",
    keywords: ["demand", "radar", "auction", "copart", "iaa", "bid", "buying", "inventory", "stock", "watchlist", "trends", "seasonal", "cross-dock", "locations"],
    content: `Demand Radar turns unfulfilled phone requests into buying intelligence:
- Monthly trends and seasonal parts insights (for example, A/C compressors in May or 4WD transfer cases in November).
- Stock alerts and yard watchlists when high-demand mechanical parts fall below target.
- Multi-location cross-dock visibility so groups can route inventory between yards.
- A Copart/IAA match engine with recommended auction bids based on real caller demand (e.g., a vehicle with 42 phone calls and immediate demand for its front clip, tailgate, and transmission).

Demand and inventory intelligence is available on Enterprise and above; advanced sentiment analytics and leaderboards start on Pro Platinum.`,
  },
  {
    id: "pricing",
    title: "Pricing and plan selection",
    keywords: ["price", "pricing", "cost", "plan", "plans", "subscription", "monthly", "annual", "yearly", "cheap", "compare", "upgrade", "starter", "pro", "platinum", "enterprise", "how much"],
    content: `Plans (USD):
- Starter — $99/mo or $1,089/yr — up to 3 rep logins. Call scoring & categories, RingCentral + webhook connectors, customer & win-back lists, daily opportunity emails.
- Pro — $249/mo or $2,739/yr — 5 rep logins included. Everything in Starter plus AI role-play trainer, daily follow-up email, vehicle arrivals & call queue, rep performance console. Extra reps: +2 for $50/mo, up to $400/mo total.
- Pro Platinum — $499/mo or $5,489/yr — up to 50 rep logins, everything in Pro plus yard champion leaderboards, advanced sentiment analytics, priority onboarding.
- Enterprise — $649/mo or $7,139/yr — up to 75 rep logins, 2 locations, every tool including monthly trends, seasonal insights, vehicle demand, stock alerts, watchlists, custom ERP/Hollander sync, priority setup.
- Enterprise Platinum — $1,149/mo or $12,639/yr — unlimited reps, up to 4 locations (+$100/mo per extra), dedicated director, custom SLA, priority 24/7 technical setup.

Annual billing is 11 months' price for 12 months (one month free). All plans start with a 1-day free trial, no credit card required. Most single-counter independent yards start on Starter or Pro. Multi-location groups usually need Enterprise.`,
  },
  {
    id: "trial",
    title: "Free trial and getting started",
    keywords: ["trial", "free", "try", "demo", "start", "signup", "sign up", "onboarding", "credit card", "card", "day", "pilot"],
    content: `Salvage Pulse offers a free 1-day trial with no credit card required. You can ingest real phone audio and see call scores live. The trial is designed to be set up quickly: connect RingCentral or another supported phone system, or upload audio, and the platform starts scoring.

For a guided setup, book a 1-on-1 yard demo. Enterprise and multi-location groups can request a tailored trial.

After the trial, choose a plan in the app or through the secure Stripe checkout. If you are unsure which plan fits, tell us the number of sales reps, locations, and whether you need AI role-play and demand intelligence.`,
  },
  {
    id: "demo",
    title: "Booking a demo",
    keywords: ["demo", "book", "schedule", "meeting", "call", "calendar", "appointment", "walkthrough", "show", "see"],
    content: `Demos are 1-on-1 and tailored to your yard. The team shows how Salvage Pulse scores recycler calls in real time, using your inventory and counter workflow as the example. Typical length is about 45 minutes.

Book directly on Cal.com: https://cal.com/gen-keech-avipdc/live-demo. Cal.com shows live availability and sends the calendar invite. Pick a time that works for you; if you need a group or multi-location walkthrough, note it when booking.

Have your yard name, number of counter reps, and current phone system handy so the demo can be tailored.`,
  },
  {
    id: "login",
    title: "Logging in and account access",
    keywords: ["login", "log in", "sign in", "password", "forgot", "reset", "access", "account", "google", "locked", "onboarding", "credentials", "roles"],
    content: `Sign in at https://app.salvagepulsepro.com/login with email and password, or use Continue with Google. First-time users may be asked to replace their starting password with their own password (at least 8 characters). Use “Forgot password?” to reset it.

Roles control what you see:
- Owner, sales manager, manager — team dashboard, call library, callbacks, reps, vehicles & stock, reports, leaderboards, shift calendar, keyword tracker, role-play, settings.
- Inventory manager — vehicles & stock, yard dashboard, call library, shift calendar, settings.
- Rep / sales rep — personal performance, my calls, callbacks, vehicle arrivals, tag vehicles, reports, leaderboards, role-play, settings.

We never ask for your password in chat. If you are locked out, use the reset link or contact support@salvagepulse.com.`,
  },
  {
    id: "billing",
    title: "Billing, payments, and cancellation",
    keywords: ["billing", "pay", "payment", "stripe", "card", "invoice", "receipt", "cancel", "cancellation", "refund", "charge", "upgrade", "downgrade", "prorate", "tax"],
    content: `Payments are processed by Stripe on a secure hosted checkout. Card details go directly to Stripe and never touch Salvage Pulse servers. You can pay monthly or annually; annual billing is 11 months' price for 12 months.

If self-serve checkout is not yet enabled on this deployment, the sales team can send a secure Stripe payment link after confirming the plan and billing interval. Do not promise a live checkout button when it is still being connected.

Plan changes and annual switches are handled through Stripe, which credits the unused portion of the current period before charging the new amount. Review the exact amount before confirming. Invoices and receipts are available through Stripe and the app's billing page.

To cancel, use the billing page in the app or contact support. Refund requests are handled by the team at support@salvagepulse.com. We do not promise refunds in chat; a teammate will review the account.`,
  },
  {
    id: "phone-integration",
    title: "Phone systems and integrations",
    keywords: ["ringcentral", "phone", "voip", "pbx", "landline", "integration", "connect", "audio", "upload", "recording", "webhook", "erp", "hollander", "sync"],
    content: `RingCentral is the primary native phone integration. VoIP/cloud phone systems can connect through secure webhooks, and audio files can be uploaded or imported. Setup typically takes under 15 minutes and does not require new hardware.

Traditional PBX/landline systems may need a call-recording export workflow; the team will confirm what is possible during a demo. Enterprise plans can include custom ERP/Hollander sync. Multi-location groups can connect sites and route/cross-dock inventory.`,
  },
  {
    id: "security",
    title: "Security, privacy, and data handling",
    keywords: ["security", "secure", "privacy", "data", "gdpr", "hipaa", "soc", "encryption", "retention", "compliance", "confidential"],
    content: `Salvage Pulse is built for business call data. Access is role-based, audio is processed to produce transcripts and scores for your yard, and payment data is handled by Stripe. Do not send passwords or card numbers in chat.

We do not publish specific certifications or retention periods in the public site, so do not guess. For security disclosures, a data processing agreement, retention details, or a vendor review, contact support@salvagepulse.com and the team will provide current documentation.`,
  },
  {
    id: "roi",
    title: "ROI and value",
    keywords: ["roi", "return", "value", "revenue", "worth", "benefit", "save", "money", "calculator", "conversion", "lost"],
    content: `The ROI calculator estimates recovered revenue from previously lost or unquoted calls. Its default assumption is that a yard recovers about 5.8% of calls through automated follow-ups, win-back queues, and better objection handling. You enter reps, monthly inbound calls per rep, and average part order ticket; it estimates additional closed parts per month and a software return multiple.

These are planning estimates, not guarantees. The real value comes from capturing quotes that are currently missed, recovering callbacks, coaching reps, and buying the parts callers actually ask for.`,
  },
  {
    id: "account-aware",
    title: "Account-aware answers and connecting your yard",
    keywords: ["account", "my plan", "my subscription", "my trial", "my reps", "my seats", "my callbacks", "my score", "my performance", "my team", "connect", "account data", "my yard", "my usage"],
    content: `A visitor can connect their Salvage Pulse yard account from the Account button in the chat header. They sign in with their app.salvagepulsepro.com email and password. The password is sent to the app to create a session and is never stored by the chatbot; account data is read-only.

With an account connected, Wheelie can answer questions about the visitor's own plan, status, trial days, rep seats, locations, callbacks, QA scores, team, role-play assignments, and inventory watchlist where their role permits.

Important: accounts still using a starting password are in limited mode. The app allows account basics (name, role, yard, plan, trial, seat counts) but blocks call-level data until the user sets their own password. The Account panel offers that one-time password change; it changes the password on app.salvagepulsepro.com and does not store the new password.

Never ask for a password in chat. If the visitor is not connected, point them to the Account button.`,
  },
  {
    id: "contact",
    title: "Contacting the team",
    keywords: ["contact", "sales", "support", "help", "human", "person", "email", "phone", "talk", "team", "message"],
    content: `Sales and free-trial questions: sales@salvagepulse.com
Yard technical support and console access: support@salvagepulse.com
You can also use the contact form on the website or ask this chat to book a demo. For billing or account-specific issues, include your yard name and the email on the account, but never include a password or card number.`,
  },
  {
    id: "comparison",
    title: "Why not a generic CRM?",
    keywords: ["crm", "compare", "competitor", "generic", "salesforce", "hubspot", "different", "better", "vs"],
    content: `Generic CRMs are built around pipelines and contacts; they do not understand a recycler's counter conversation. Salvage Pulse is built around the actual work: Hollander interchange, OEM used part grades, core charges, warranty objections, delivery and freight, auction buying, and the rapid pace of inbound parts calls.

That domain focus is why it can score the seven recycler-specific metrics, match callers to vehicles and parts, generate callback and win-back queues, and turn missed part requests into auction demand signals.`,
  },
  {
    id: "support",
    title: "Troubleshooting and support",
    keywords: ["bug", "error", "not working", "broken", "issue", "problem", "troubleshoot", "support", "audio", "upload", "score", "missing", "transcript"],
    content: `For a technical issue, collect: your yard name, the account email, what you were doing, the call or page involved, and a screenshot if possible. Send it to support@salvagepulse.com. Never send your password.

Common checks:
- No audio or transcript: confirm the phone connector is active or the upload finished, then refresh the call.
- Wrong or missing score: check that the call has finished processing; if it is still wrong, send the call link to support for review.
- Cannot sign in: use “Forgot password?” or Google sign-in, then contact support if the account is locked.
- Seat or plan question: confirm the plan's included rep logins, then contact sales for extra seats.`,
  },
];

const STOP_WORDS = new Set(
  "a an and are as at be but by can could do does for from get got has have how i if in is it its me my of on or our so that the their there this to us was we what when where which who why will with you your".split(" "),
);

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function retrieveKnowledge(query, limit = 5) {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];

  const scored = sections.map((section) => {
    const haystack = `${section.title} ${section.keywords.join(" ")} ${section.content}`.toLowerCase();
    let score = 0;
    for (const token of new Set(queryTokens)) {
      if (section.keywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) score += 4;
      if (section.title.toLowerCase().includes(token)) score += 3;
      const occurrences = haystack.split(token).length - 1;
      score += Math.min(occurrences, 4);
    }
    return { section, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.section);
}

export function knowledgeForPrompt(query) {
  const relevant = retrieveKnowledge(query, 5);
  const chosen = relevant.length ? relevant : sections.slice(0, 2);
  return chosen.map((section) => `### ${section.title}\n${section.content}`).join("\n\n");
}

export function getPlan(id) {
  return plans.find((plan) => plan.id === id) || null;
}

export function planSummary(plan, interval = "month") {
  const amount = interval === "year" ? plan.priceYearly : plan.price;
  const suffix = interval === "year" ? "/year" : "/month";
  return `${plan.name} — $${amount.toLocaleString("en-US")}${suffix}`;
}
