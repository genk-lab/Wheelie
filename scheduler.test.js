import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-scheduler-"));
process.env.DATA_DIR = dataDir;
process.env.SMTP_HOST = "";
process.env.DEMO_LEAD_TIME_HOURS = "1";

const { getAvailability, bookDemo, demoIcs } = await import("../server/scheduler.js");
const { buildIcs, zonedTimeToUtc } = await import("../server/util.js");

test("converts Eastern wall time to UTC across DST", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "10:00", "America/New_York").toISOString(), "2026-07-14T14:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-11-10", "10:00", "America/New_York").toISOString(), "2026-11-10T15:00:00.000Z");
});

test("returns weekday demo slots in the future", async () => {
  const slots = await getAvailability();
  assert.ok(slots.length > 0);
  for (const slot of slots.slice(0, 8)) {
    assert.ok(new Date(slot.startIso) > new Date(Date.now() - 60_000));
    const weekday = new Date(`${slot.date}T12:00:00Z`).getUTCDay();
    assert.ok(weekday >= 1 && weekday <= 5);
    assert.ok(["10:00", "14:00", "16:30"].includes(slot.time));
  }
});

test("books a slot, removes it from availability, and generates an ICS", async () => {
  const [slot] = await getAvailability();
  const demo = await bookDemo({
    name: "Test Owner",
    yard: "Test Yard",
    email: "test@example.com",
    phone: "5551234567",
    phoneSystem: "RingCentral",
    reps: "4 to 10 Reps (Pro)",
    date: slot.date,
    time: slot.time,
    notes: "Test booking",
    source: "test",
  });

  assert.equal(demo.status, "confirmed");
  assert.equal(demo.email, "test@example.com");
  assert.ok(demo.id.startsWith("demo_"));

  const remaining = await getAvailability();
  assert.ok(!remaining.some((item) => item.startIso === slot.startIso), "booked slot should be unavailable");

  const ics = buildIcs(demoIcs(demo));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:/);
  assert.match(ics, /test@example\.com/);
});

test("is idempotent for the same email and slot", async () => {
  const slots = await getAvailability();
  const slot = slots[0];
  const payload = {
    name: "Repeat Person",
    yard: "Repeat Yard",
    email: "repeat@example.com",
    phone: "5559876543",
    date: slot.date,
    time: slot.time,
  };
  const first = await bookDemo(payload);
  const second = await bookDemo(payload);
  assert.equal(first.id, second.id);
});

test("rejects invalid contact details", async () => {
  const [slot] = await getAvailability();
  await assert.rejects(
    () =>
      bookDemo({
        name: "Bad Email",
        yard: "Bad Yard",
        email: "not-an-email",
        phone: "5551234567",
        date: slot.date,
        time: slot.time,
      }),
    /valid business email/i,
  );
});

test("rejects non-slot times", async () => {
  const [slot] = await getAvailability();
  await assert.rejects(
    () =>
      bookDemo({
        name: "Wrong Time",
        yard: "Wrong Yard",
        email: "wrong@example.com",
        phone: "5551234567",
        date: slot.date,
        time: "12:15",
      }),
    /available demo times/i,
  );
});

test("rejects impossible dates", async () => {
  await assert.rejects(
    () =>
      bookDemo({
        name: "Bad Date",
        yard: "Bad Date Yard",
        email: "baddate@example.com",
        phone: "5551234567",
        date: "2026-99-99",
        time: "10:00",
      }),
    /valid demo date/i,
  );
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
