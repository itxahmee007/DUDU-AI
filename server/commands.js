// commands.js
// A simple, free (no AI needed) command parser so you can manage your
// schedule by chatting with the bot directly in WhatsApp.
//
// Supported commands:
//   ADD <time> <task title>   e.g. ADD 6:00 PM Call supplier
//   LIST                       Shows today's schedule
//   DONE <task number>         Marks that task acknowledged
//   DELETE <task number>       Removes that task
//   LOG <text>                 Saves a work-log entry for today
//   SUMMARY                    Sends today's stats
//   HELP                       Lists all commands

const db = require("./db");

function pad(n) { return String(n).padStart(2, "0"); }
function todayPK() {
  const pkNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return `${pkNow.getUTCFullYear()}-${pad(pkNow.getUTCMonth() + 1)}-${pad(pkNow.getUTCDate())}`;
}

function parseTime(raw) {
  raw = raw.trim().toUpperCase();
  let match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) match = raw.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] && /^\d+$/.test(match[2]) ? parseInt(match[2], 10) : 0;
  const ampm = match[3] || match[2];

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

const HELP_TEXT = `🤖 *DailyBot commands*

*ADD <time> <task>*
e.g. ADD 6:00 PM Call client

*LIST*
Show today's schedule

*DONE <number>*
Mark a task done (use number from LIST)

*DELETE <number>*
Remove a task

*LOG <text>*
Save a work note for today

*SUMMARY*
Today's stats

*HELP*
Show this message`;

function handleCommand(rawText) {
  const text = rawText.trim();
  const upper = text.toUpperCase();
  const today = todayPK();

  if (upper === "HELP" || upper === "MENU") {
    return HELP_TEXT;
  }

  if (upper.startsWith("ADD ")) {
    const rest = text.slice(4).trim();
    const timeMatch = rest.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s+(.+)$/i);
    if (!timeMatch) {
      return "⚠️ Couldn't understand the time. Try: ADD 6:00 PM Call client";
    }
    const time = parseTime(timeMatch[1]);
    const title = timeMatch[2].trim();
    if (!time) return "⚠️ Couldn't understand the time. Try: ADD 6:00 PM Call client";
    if (!title) return "⚠️ Please include a task title. Try: ADD 6:00 PM Call client";

    db.prepare(
      `INSERT INTO schedule_items (title, scheduled_time, date) VALUES (?, ?, ?)`
    ).run(title, time, today);

    return `✅ Added: "${title}" at ${timeMatch[1].trim()}`;
  }

  if (upper === "LIST") {
    const items = db.prepare(
      `SELECT * FROM schedule_items WHERE date = ? ORDER BY scheduled_time`
    ).all(today);
    if (items.length === 0) return "Nothing scheduled for today. Use ADD <time> <task> to add something.";

    const statusEmoji = { pending: "⏳", sent: "📨", acknowledged: "✅", escalated: "🚨", missed: "❌" };
    const lines = items.map((it, i) =>
      `${i + 1}. ${statusEmoji[it.status] || ""} ${it.scheduled_time} — ${it.title}`
    );
    return `📋 *Today's schedule:*\n\n${lines.join("\n")}`;
  }

  if (upper.startsWith("DONE ")) {
    const n = parseInt(text.slice(5).trim(), 10);
    const items = db.prepare(`SELECT * FROM schedule_items WHERE date = ? ORDER BY scheduled_time`).all(today);
    if (!n || !items[n - 1]) return "⚠️ Couldn't find that task number. Send LIST to see current numbers.";
    db.prepare(`UPDATE schedule_items SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?`)
      .run(items[n - 1].id);
    return `✅ Marked "${items[n - 1].title}" as done.`;
  }

  if (upper.startsWith("DELETE ")) {
    const n = parseInt(text.slice(7).trim(), 10);
    const items = db.prepare(`SELECT * FROM schedule_items WHERE date = ? ORDER BY scheduled_time`).all(today);
    if (!n || !items[n - 1]) return "⚠️ Couldn't find that task number. Send LIST to see current numbers.";
    db.prepare(`DELETE FROM schedule_items WHERE id = ?`).run(items[n - 1].id);
    return `🗑️ Removed "${items[n - 1].title}".`;
  }

  if (upper.startsWith("LOG ")) {
    const content = text.slice(4).trim();
    if (!content) return "⚠️ Please include text. Try: LOG Finished the client report";
    db.prepare(`INSERT INTO daily_logs (date, entry_type, content) VALUES (?, 'work_log', ?)`).run(today, content);
    return "📝 Saved to today's log.";
  }

  if (upper === "SUMMARY") {
    const items = db.prepare(`SELECT * FROM schedule_items WHERE date = ?`).all(today);
    const total = items.length;
    const done = items.filter((i) => i.status === "acknowledged").length;
    const missed = items.filter((i) => i.status === "escalated").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    return `📊 *Today's summary*\n\nTasks: ${total}\nDone: ${done}\nMissed: ${missed}\nOn track: ${rate}%`;
  }

  return null;
}

module.exports = { handleCommand, parseTime };
