// index.js — main server entry point
require("dotenv").config();
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const db = require("./db");
const whatsapp = require("./whatsapp");
const scheduler = require("./scheduler");

// Same Pakistan-timezone fix as scheduler.js — "today" must mean today in
// Pakistan, not UTC, otherwise near midnight PKT the wrong date is used.
function todayPK() {
  const PK_OFFSET_HOURS = 5;
  const pkNow = new Date(Date.now() + PK_OFFSET_HOURS * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pkNow.getUTCFullYear()}-${pad(pkNow.getUTCMonth() + 1)}-${pad(pkNow.getUTCDate())}`;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const wsClients = new Set();
wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
scheduler.setAlarmBroadcaster(broadcast);

// ---------- WhatsApp status / QR ----------
app.get("/api/whatsapp/status", (req, res) => {
  res.json(whatsapp.getStatus());
});

// ---------- Schedule items (your nightly planning) ----------
app.post("/api/schedule", (req, res) => {
  const { title, notes, scheduled_time, date } = req.body;
  if (!title || !scheduled_time || !date) {
    return res.status(400).json({ error: "title, scheduled_time, date are required" });
  }
  const result = db.prepare(
    `INSERT INTO schedule_items (title, notes, scheduled_time, date) VALUES (?, ?, ?, ?)`
  ).run(title, notes || null, scheduled_time, date);
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/schedule", (req, res) => {
  const date = req.query.date || todayPK();
  const rows = db.prepare(`SELECT * FROM schedule_items WHERE date = ? ORDER BY scheduled_time`).all(date);
  res.json(rows);
});

app.delete("/api/schedule/:id", (req, res) => {
  db.prepare(`DELETE FROM schedule_items WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/schedule/:id/acknowledge", (req, res) => {
  scheduler.acknowledge(req.params.id);
  res.json({ ok: true });
});

// ---------- Daily logs (work analysis / summary entries you type or speak) ----------
app.post("/api/logs", (req, res) => {
  const { date, entry_type, content } = req.body;
  if (!date || !entry_type || !content) {
    return res.status(400).json({ error: "date, entry_type, content required" });
  }
  const result = db.prepare(
    `INSERT INTO daily_logs (date, entry_type, content) VALUES (?, ?, ?)`
  ).run(date, entry_type, content);
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/logs", (req, res) => {
  const date = req.query.date || todayPK();
  const rows = db.prepare(`SELECT * FROM daily_logs WHERE date = ? ORDER BY created_at`).all(date);
  res.json(rows);
});

// Simple, free, non-AI daily summary: counts + concatenated notes.
// (For a richer AI-written summary, paste these logs into a Claude chat —
// no extra cost since claude.ai/app access is free for personal use.)
app.get("/api/logs/summary", (req, res) => {
  const date = req.query.date || todayPK();
  const items = db.prepare(`SELECT * FROM schedule_items WHERE date = ?`).all(date);
  const logs = db.prepare(`SELECT * FROM daily_logs WHERE date = ?`).all(date);

  const total = items.length;
  const done = items.filter(i => i.status === "acknowledged").length;
  const missed = items.filter(i => i.status === "escalated").length;

  res.json({
    date,
    totalTasks: total,
    completed: done,
    missed,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    logEntries: logs,
    scheduleItems: items,
  });
});

// ---------- Contacts (people you message via the bot) ----------
app.post("/api/contacts", (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  db.prepare(`INSERT OR REPLACE INTO contacts (name, phone) VALUES (?, ?)`).run(name, phone);
  res.json({ ok: true });
});

app.get("/api/contacts", (req, res) => {
  res.json(db.prepare(`SELECT * FROM contacts ORDER BY name`).all());
});

// ---------- Message queue ("send X to person Y at time Z") ----------
app.post("/api/messages/queue", (req, res) => {
  const { contact_name, message, send_time, date } = req.body;
  if (!contact_name || !message || !send_time || !date) {
    return res.status(400).json({ error: "contact_name, message, send_time, date required" });
  }
  const result = db.prepare(
    `INSERT INTO message_queue (contact_name, message, send_time, date) VALUES (?, ?, ?, ?)`
  ).run(contact_name, message, send_time, date);
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/messages/queue", (req, res) => {
  const date = req.query.date || todayPK();
  res.json(db.prepare(`SELECT * FROM message_queue WHERE date = ? ORDER BY send_time`).all(date));
});

// ---------- Test: send yourself a message right now ----------
app.post("/api/whatsapp/test", async (req, res) => {
  try {
    await whatsapp.sendToSelf("✅ Test message from your DailyBot — connection works!");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const commands = require("./commands");

// When you message the bot on WhatsApp, first check if it's a recognized
// command (ADD/LIST/DONE/DELETE/LOG/SUMMARY/HELP). If not, fall back to
// treating any reply as an acknowledgement of the most recent reminder —
// this keeps the original "just reply anything to confirm" behavior working
// alongside the new command system.
whatsapp.setIncomingMessageHandler(async (msg) => {
  // fromMe = true means it's a message you sent (since you message your own
  // "self" chat, your replies show up as fromMe in that thread)
  if (!msg.fromMe) return;

  const reply = commands.handleCommand(msg.body || "");
  if (reply !== null) {
    try {
      await whatsapp.sendToSelf(reply);
    } catch (e) {
      console.error("[index] Failed to send command reply:", e.message);
    }
    broadcast({ type: "REFRESH" }); // tell web app to re-fetch (schedule may have changed)
    return;
  }

  // Not a recognized command — treat as an acknowledgement, same as before.
  const acked = scheduler.acknowledgeMostRecentPending();
  if (acked) {
    broadcast({ type: "ACK", scheduleId: acked.id, title: acked.title });
    console.log(`[whatsapp] Acknowledged via reply: ${acked.title}`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[server] DailyBot running on http://localhost:${PORT}`);
});

whatsapp.init();
scheduler.start();
whatsapp.init();
scheduler.start();
