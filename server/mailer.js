import nodemailer from "nodemailer";
import { config } from "./config.js";
import { escapeHtml, formatInZone } from "./util.js";

let transporter = null;

function getTransport() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

function demoHtml(demo, icsAttached) {
  const when = formatInZone(demo.startIso, demo.timezone);
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;color:#0f172a">
    <div style="background:#060b16;padding:22px 26px;border-radius:12px 12px 0 0">
      <div style="color:#38bdf8;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700">Salvage Pulse</div>
      <h1 style="color:#fff;font-size:23px;margin:8px 0 0">Your yard demo is booked</h1>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px 26px">
      <p>Hi ${escapeHtml(demo.name.split(" ")[0])},</p>
      <p>You are confirmed for a 1-on-1 Salvage Pulse demo for <strong>${escapeHtml(demo.yard)}</strong>.</p>
      <table style="border-collapse:collapse;margin:18px 0">
        <tr><td style="padding:5px 14px 5px 0;color:#64748b">When</td><td style="padding:5px 0"><strong>${escapeHtml(when)}</strong></td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#64748b">Length</td><td style="padding:5px 0">${config.demo.durationMinutes} minutes</td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#64748b">Phone system</td><td style="padding:5px 0">${escapeHtml(demo.phoneSystem)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#64748b">Counter size</td><td style="padding:5px 0">${escapeHtml(demo.reps)}</td></tr>
      </table>
      <p>We will show live call scoring tailored to your inventory and counter workflow. A Google Meet link will be sent before the demo.</p>
      ${icsAttached ? "<p style=\"color:#475569;font-size:13px\">A calendar invite is attached. Add it to your calendar so you do not miss the slot.</p>" : ""}
      <p style="margin-top:24px">Need to move it? Reply to this email or contact <a href="mailto:${config.support.salesEmail}">${config.support.salesEmail}</a>.</p>
      <p style="color:#64748b;font-size:13px;margin-top:24px">Salvage Pulse · Your data-driven solution</p>
    </div>
  </div>`;
}

export async function sendDemoEmails(demo, icsContent) {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: "SMTP not configured" };
  }

  const when = formatInZone(demo.startIso, demo.timezone);
  const attachments = icsContent
    ? [
        {
          filename: "salvage-pulse-demo.ics",
          content: icsContent,
          contentType: "text/calendar; method=REQUEST; charset=UTF-8",
        },
      ]
    : [];

  const results = await Promise.allSettled([
    transport.sendMail({
      from: config.smtp.from,
      to: demo.email,
      replyTo: config.support.salesEmail,
      subject: `Confirmed: Salvage Pulse demo for ${demo.yard} — ${when}`,
      text: `Hi ${demo.name},\n\nYour Salvage Pulse demo for ${demo.yard} is confirmed for ${when} (${config.demo.durationMinutes} minutes).\n\nWe will send a Google Meet link before the demo. Need to move it? Contact ${config.support.salesEmail}.\n\n— Salvage Pulse`,
      html: demoHtml(demo, attachments.length > 0),
      attachments,
    }),
    transport.sendMail({
      from: config.smtp.from,
      to: config.support.salesEmail,
      replyTo: demo.email,
      subject: `New demo booked: ${demo.yard} — ${when}`,
      text: [
        `New demo booking from the website chatbot.`,
        `Name: ${demo.name}`,
        `Yard: ${demo.yard}`,
        `Email: ${demo.email}`,
        `Phone: ${demo.phone}`,
        `Phone system: ${demo.phoneSystem}`,
        `Counter size: ${demo.reps}`,
        `When: ${when}`,
        `Notes: ${demo.notes || "—"}`,
        `Booking ID: ${demo.id}`,
      ].join("\n"),
      attachments,
    }),
  ]);

  return {
    sent: results.some((result) => result.status === "fulfilled"),
    errors: results
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason?.message || result.reason)),
  };
}

export async function sendContactEmail(contact) {
  const transport = getTransport();
  if (!transport) return { sent: false, reason: "SMTP not configured" };

  const result = await transport.sendMail({
    from: config.smtp.from,
    to: contact.department === "support" ? config.support.supportEmail : config.support.salesEmail,
    replyTo: contact.email,
    subject: `[Chatbot] ${contact.topic || "Website inquiry"} — ${contact.name} (${contact.yard || "no yard"})`,
    text: [
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone || "—"}`,
      `Yard: ${contact.yard || "—"}`,
      `Topic: ${contact.topic || "—"}`,
      "",
      contact.message,
    ].join("\n"),
  });
  return { sent: true, messageId: result.messageId };
}
