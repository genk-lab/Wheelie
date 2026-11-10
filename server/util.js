import { randomUUID, createHash } from "node:crypto";

export function id(prefix = "id") {
  return `${prefix}_${randomUUID().slice(0, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function sessionId(value) {
  return createHash("sha256").update(String(value || randomUUID())).digest("hex").slice(0, 24);
}

export function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanMultiline(value, max = 3000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

export function isPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatMoney(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function jsonResponse(res, status, payload) {
  res.status(status).set("Cache-Control", "no-store").json(payload);
}

/* ---------- Time-zone helpers (no external dependency) ---------- */

const partsFormatterCache = new Map();

function partsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
  }
  return partsFormatterCache.get(timeZone);
}

function zonedParts(date, timeZone) {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr).split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let offset = guess - Date.UTC(
    zonedParts(new Date(guess), timeZone).year,
    zonedParts(new Date(guess), timeZone).month - 1,
    zonedParts(new Date(guess), timeZone).day,
    zonedParts(new Date(guess), timeZone).hour,
    zonedParts(new Date(guess), timeZone).minute,
    zonedParts(new Date(guess), timeZone).second,
  );
  let result = guess + offset;

  const corrected = zonedParts(new Date(result), timeZone);
  offset = guess - Date.UTC(corrected.year, corrected.month - 1, corrected.day, corrected.hour, corrected.minute, corrected.second);
  result += offset;
  return new Date(result);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function dateKeyInZone(date, timeZone) {
  const parts = zonedParts(new Date(date), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatInZone(date, timeZone, options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  }).format(new Date(date));
}

export function formatTimeLabel(timeStr) {
  const [h, m] = String(timeStr).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function icsEscape(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function icsDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs({ uid, title, description, startIso, endIso, organizerEmail, attendeeEmail, attendeeName, location }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salvage Pulse//Demo Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(startIso)}`,
    `DTEND:${icsDate(endIso)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(location || "Google Meet / phone (link sent by email)")}`,
    `ORGANIZER;CN=Salvage Pulse:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${icsEscape(attendeeName)};RSVP=TRUE:mailto:${attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Salvage Pulse demo reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
