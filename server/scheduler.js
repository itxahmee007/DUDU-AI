// scheduler.js
// The actual "brain" of the bot — but it's plain logic, not AI, and that's
// intentional (no paid API needed). It:
//   1. Every minute, checks if any schedule_items match the current time → sends WhatsApp
//   2. Every minute, checks any 'sent' items that are now 5+ min old with no reply
//      → marks them 'escalated' and pushes a loud in-app alarm via WebSocket
//   3. Every minute, checks message_queue for "send this to X at this time" entries

const cron = require("node-cron");
const db = require("./db");
const whatsapp = require("./whatsapp");

let broadcastAlarm = () => {}; // set by index.js (sends to connected web app via WS)

function setAlarmBroadcaster(fn) {
  broadcastAlarm = fn;
}

function pad(n) { return String(n).padStart(2, "0"); }

function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

async function checkSchedule() {
  const { date, time } = nowParts();

  // 1. Send reminders that are due right now
  const due = db.prepare(
    `SELECT * FROM schedule_items WHERE date = ? AND scheduled_time = ? AND status = 'pending'`
  ).all(date, time);

  for (const item of due) {
    try {
      const text = `⏰ Reminder: ${item.title}${item.notes ? "\n" + item.notes : ""}\n\n(Reply anything to acknowledge — I'll check in 5 min)`;
      await whatsapp.sendToSelf(text);
      db.prepare(`UPDATE schedule_items SET status = 'sent', sent_at = datetime('now') WHERE id = ?`)
        .run(item.id);
      console.log(`[scheduler] Sent reminder #${item.id}: ${item.title}`);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder #${item.id}:`, err.message);
    }
  }

  // 2. Escalate anything sent 5+ minutes ago with no acknowledgement
  const sentItems = db.prepare(`SELECT * FROM schedule_items WHERE status = 'sent'`).all();
  for (const item of sentItems) {
    if (!item.sent_at) continue;
    const sentAt = new Date(item.sent_at + "Z"); // sqlite datetime('now') is UTC
    const minutesSince = (Date.now() - sentAt.getTime()) / 60000;
    if (minutesSince >= 5) {
      db.prepare(`UPDATE schedule_items SET status = 'escalated' WHERE id = ?`).run(item.id);
      // Fire the loud in-app alarm (push to web app via WebSocket)
      broadcastAlarm({
        type: "ESCALATE",
        scheduleId: item.id,
        title: item.title,
        message: `You didn't respond to "${item.title}" — escalation alarm triggered.`,
      });
      // Also send a follow-up WhatsApp nudge
      whatsapp.sendToSelf(`🚨 You didn't respond to "${item.title}" within 5 minutes. Opening the alarm now.`)
        .catch(() => {});
      console.log(`[scheduler] Escalated reminder #${item.id}`);
    }
  }

  // 3. Send any queued "message someone at X time" entries
  const queuedMsgs = db.prepare(
    `SELECT * FROM message_queue WHERE date = ? AND send_time = ? AND status = 'pending'`
  ).all(date, time);

  for (const q of queuedMsgs) {
    try {
      const contact = db.prepare(`SELECT * FROM contacts WHERE name = ?`).get(q.contact_name);
      if (!contact) {
        db.prepare(`UPDATE message_queue SET status = 'failed' WHERE id = ?`).run(q.id);
        continue;
      }
      await whatsapp.sendToNumber(contact.phone, q.message);
      db.prepare(`UPDATE message_queue SET status = 'sent' WHERE id = ?`).run(q.id);
      console.log(`[scheduler] Sent queued message to ${q.contact_name}`);
    } catch (err) {
      db.prepare(`UPDATE message_queue SET status = 'failed' WHERE id = ?`).run(q.id);
      console.error(`[scheduler] Failed queued message #${q.id}:`, err.message);
    }
  }
}

// Mark a schedule item acknowledged (called when you reply on WhatsApp, or tap "done" in web app)
function acknowledge(scheduleId) {
  db.prepare(
    `UPDATE schedule_items SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?`
  ).run(scheduleId);
}

// Try to match an incoming WhatsApp reply to the most recent 'sent' or 'escalated' item
function acknowledgeMostRecentPending() {
  const item = db.prepare(
    `SELECT * FROM schedule_items WHERE status IN ('sent','escalated') ORDER BY sent_at DESC LIMIT 1`
  ).get();
  if (item) {
    acknowledge(item.id);
    return item;
  }
  return null;
}

function start() {
  // runs once per minute, on the minute
  cron.schedule("* * * * *", () => {
    checkSchedule().catch((e) => console.error("[scheduler] tick error:", e));
  });
  console.log("[scheduler] Started — checking every minute.");
}

module.exports = {
  start,
  setAlarmBroadcaster,
  acknowledge,
  acknowledgeMostRecentPending,
};
