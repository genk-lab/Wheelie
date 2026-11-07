const $ = (selector, root = document) => root.querySelector(selector);

const tokenInput = $("#admin-token");
const tokenForm = $("#token-form");
const status = $("#admin-status");
const stats = $("#admin-stats");
const sections = ["demos", "contacts", "purchases", "events"].map((name) => ({
  name,
  section: $(`#${name}-section`),
  table: $(`#${name}-table`),
}));

tokenInput.value = sessionStorage.getItem("sp-admin-token") || "";

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value == null || value === "" ? "—" : String(value);
  return td;
}

function row(values) {
  const tr = document.createElement("tr");
  for (const value of values) tr.appendChild(cell(value));
  return tr;
}

function renderTable(table, headers, rows, emptyText) {
  table.innerHTML = "";
  if (!rows.length) {
    const tbody = document.createElement("tbody");
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length;
    td.className = "empty";
    td.textContent = emptyText;
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    return;
  }

  const thead = document.createElement("thead");
  thead.appendChild(row(headers));
  const tbody = document.createElement("tbody");
  for (const values of rows) tbody.appendChild(row(values));
  table.appendChild(thead);
  table.appendChild(tbody);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(cents, currency) {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format(cents / 100);
}

async function load(token) {
  status.textContent = "Loading…";
  try {
    const response = await fetch("/api/admin/summary", {
      headers: { "X-Admin-Token": token },
    });
    if (response.status === 404) {
      throw new Error("That token did not work, or the admin page is disabled.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load activity.");

    sessionStorage.setItem("sp-admin-token", token);
    status.textContent = "";
    stats.hidden = false;
    $("#stat-demos").textContent = data.counts.demos;
    $("#stat-contacts").textContent = data.counts.contacts;
    $("#stat-purchases").textContent = data.counts.purchases;

    for (const item of sections) item.section.hidden = false;

    const demos = [...(data.demos || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    renderTable(
      $("#demos-table"),
      ["When", "Name", "Yard", "Email", "Phone", "System", "Reps", "Status", "Booked"],
      demos.map((demo) => [
        `${demo.date || ""} ${demo.time || ""}`,
        demo.name,
        demo.yard,
        demo.email,
        demo.phone,
        demo.phoneSystem,
        demo.reps,
        demo.status,
        formatDate(demo.createdAt),
      ]),
      "No demos booked yet.",
    );

    renderTable(
      $("#contacts-table"),
      ["Created", "Department", "Name", "Email", "Yard", "Topic", "Message"],
      (data.contacts || []).map((contact) => [
        formatDate(contact.createdAt),
        contact.department,
        contact.name,
        contact.email,
        contact.yard,
        contact.topic,
        contact.message,
      ]),
      "No contact messages yet.",
    );

    renderTable(
      $("#purchases-table"),
      ["Created", "Email", "Plan", "Interval", "Amount", "Status", "Session"],
      (data.purchases || []).map((purchase) => [
        formatDate(purchase.createdAt),
        purchase.email,
        purchase.planName || purchase.plan,
        purchase.interval,
        money(purchase.amount, purchase.currency),
        purchase.status,
        purchase.checkoutSessionId,
      ]),
      "No completed Stripe purchases yet.",
    );

    renderTable(
      $("#events-table"),
      ["Time", "Type", "Details"],
      (data.recentEvents || []).map((event) => [
        formatDate(event.at),
        event.type,
        Object.entries(event)
          .filter(([key]) => !["id", "type", "at"].includes(key))
          .map(([key, value]) => `${key}=${String(value).slice(0, 120)}`)
          .join(" · "),
      ]),
      "No events yet.",
    );
  } catch (error) {
    status.textContent = error.message;
    stats.hidden = true;
    for (const item of sections) item.section.hidden = true;
  }
}

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (token) load(token);
});

if (tokenInput.value) load(tokenInput.value);
