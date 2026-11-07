import { config } from "./config.js";
import { addEvent, readStore, updateStore } from "./store.js";
import {
  addDays,
  dateKeyInZone,
  formatInZone,
  formatTimeLabel,
  id,
  isEmail,
  isPhone,
  clean,
  cleanMultiline,
  zonedTimeToUtc,
} from "./util.js";

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

function weekdayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function endIso(startIso) {
  return new Date(new Date(startIso).getTime() + config.demo.durationMinutes * 60_000).toISOString();
}

function demoPublic(demo) {
  return {
    id: demo.id,
    date: demo.date,
    time: demo.time,
    startIso: demo.startIso,
    endIso: demo.endIso,
    name: demo.name,
    yard: demo.yard,
    email: demo.email,
    phone: demo.phone,
    phoneSystem: demo.phoneSystem,
    reps: demo.reps,
    notes: demo.notes,
    status: demo.status,
    createdAt: demo.createdAt,
    timezone: demo.timezone,
  };
}

export async function getAvailability({ days = config.demo.daysAhead } = {}) {
  const store = await readStore();
  const now = new Date();
  const earliest = new Date(now.getTime() + config.demo.leadTimeHours * 60 * 60 * 1000);
  const todayKey = dateKeyInZone(now, config.demo.timezone);

  const out = [];
  for (let offset = 0; offset <= Math.min(days, config.demo.daysAhead); offset += 1) {
    const dateKey = dateKeyInZone(addDays(now, offset), config.demo.timezone);
    if (dateKey < todayKey) continue;
    const weekday = weekdayNumber(dateKey);
    if (weekday === 0 || weekday === 6) continue;

    for (const time of config.demo.slots) {
      const start = zonedTimeToUtc(dateKey, time, config.demo.timezone);
      if (start < earliest) continue;
      const startIsoValue = start.toISOString();
      const booked = store.demos.filter(
        (demo) => demo.status === "confirmed" && demo.startIso === startIsoValue,
      ).length;
      if (booked >= config.demo.maxPerSlot) continue;

      out.push({
        date: dateKey,
        time,
        startIso: startIsoValue,
        endIso: endIso(startIsoValue),
        label: formatInZone(start, config.demo.timezone, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }),
        timeLabel: `${formatTimeLabel(time)} ${config.demo.timezoneLabel}`,
        dayLabel: formatInZone(start, config.demo.timezone, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        available: true,
      });
    }
  }
  return out;
}

export async function getAvailabilitySummary(limit = 6) {
  const slots = await getAvailability();
  return slots.slice(0, limit).map((slot) => ({
    date: slot.date,
    time: slot.time,
    startIso: slot.startIso,
    label: slot.label,
  }));
}

export async function bookDemo(input) {
  const payload = {
    name: clean(input.name, 120),
    yard: clean(input.yard, 160),
    email: clean(input.email, 200).toLowerCase(),
    phone: clean(input.phone, 40),
    phoneSystem: clean(input.phoneSystem, 80) || "Not sure",
    reps: clean(input.reps, 80) || "Not sure",
    notes: cleanMultiline(input.notes, 1200),
    date: clean(input.date, 10),
    time: clean(input.time, 5),
    source: clean(input.source, 40) || "chat",
    sessionId: clean(input.sessionId, 80),
  };

  const errors = [];
  if (!payload.name) errors.push("Please add your full name.");
  if (!payload.yard) errors.push("Please add your yard or business name.");
  if (!isEmail(payload.email)) errors.push("Please add a valid business email.");
  if (!isPhone(payload.phone)) errors.push("Please add a phone number with at least 10 digits.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    errors.push("Please choose a demo date.");
  } else {
    const parsed = new Date(`${payload.date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== payload.date) {
      errors.push("Please choose a valid demo date.");
    }
  }
  if (!/^\d{1,2}:\d{2}$/.test(payload.time)) {
    errors.push("Please choose a demo time.");
  } else if (!config.demo.slots.includes(payload.time)) {
    errors.push("Please choose one of the available demo times.");
  }
  const weekday = weekdayNumber(payload.date);
  if (!errors.length && (weekday === 0 || weekday === 6)) {
    errors.push("Demos are available Monday through Friday.");
  }
  if (!errors.length && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    const today = dateKeyInZone(new Date(), config.demo.timezone);
    const lastDay = dateKeyInZone(addDays(new Date(), config.demo.daysAhead), config.demo.timezone);
    if (payload.date < today) errors.push("Please choose a future demo date.");
    if (payload.date > lastDay) errors.push("Please choose a date within the next three weeks.");
  }

  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    error.details = errors;
    throw error;
  }

  const start = zonedTimeToUtc(payload.date, payload.time, config.demo.timezone);
  const startIsoValue = start.toISOString();
  const earliest = new Date(Date.now() + config.demo.leadTimeHours * 60 * 60 * 1000);
  if (start < earliest) {
    const error = new Error("That time is too soon. Please choose a later demo slot.");
    error.status = 400;
    throw error;
  }

  let created;
  await updateStore((store) => {
    const duplicate = store.demos.find(
      (demo) =>
        demo.status === "confirmed" &&
        demo.startIso === startIsoValue &&
        demo.email === payload.email,
    );
    if (duplicate) {
      created = duplicate;
      return;
    }

    const booked = store.demos.filter(
      (demo) => demo.status === "confirmed" && demo.startIso === startIsoValue,
    ).length;
    if (booked >= config.demo.maxPerSlot) {
      const error = new Error("That slot was just taken. Please choose another time.");
      error.status = 409;
      throw error;
    }

    created = {
      id: id("demo"),
      ...payload,
      timezone: config.demo.timezone,
      startIso: startIsoValue,
      endIso: endIso(startIsoValue),
      status: "confirmed",
      createdAt: new Date().toISOString(),
      reminderSentAt: null,
      updatedAt: new Date().toISOString(),
    };
    store.demos.push(created);
  });

  await addEvent("demo.booked", { demoId: created.id, email: created.email, source: payload.source });
  return demoPublic(created);
}

export async function listDemos({ limit = 100 } = {}) {
  const store = await readStore();
  return store.demos
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map(demoPublic);
}

export function demoIcs(demo) {
  return {
    uid: `${demo.id}@salvagepulsepro.com`,
    title: "Salvage Pulse 1-on-1 Yard Demo",
    description: [
      `Yard: ${demo.yard}`,
      `Contact: ${demo.name}`,
      `Phone system: ${demo.phoneSystem}`,
      `Counter size: ${demo.reps}`,
      demo.notes ? `Notes: ${demo.notes}` : "",
      "",
      "We will walk through live call scoring tailored to your yard. Join from a quiet spot with your phone system details handy.",
    ]
      .filter(Boolean)
      .join("\n"),
    startIso: demo.startIso,
    endIso: demo.endIso,
    organizerEmail: config.support.salesEmail,
    attendeeEmail: demo.email,
    attendeeName: demo.name,
    location: "Google Meet (link will be emailed before the demo)",
  };
}
