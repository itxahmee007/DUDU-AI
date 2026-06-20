// db.js — local SQLite database. No external services, no cloud DB.
// Stores everything on disk in /data/dailybot.sqlite

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "dailybot.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  scheduled_time TEXT NOT NULL,      -- "HH:MM" 24hr, local time
  date TEXT NOT NULL,                -- "YYYY-MM-DD", the day this applies to
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | acknowledged | escalated | missed
  sent_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  entry_type TEXT NOT NULL,         -- 'work_log' | 'reflection'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL              -- international format, no +, e.g. 923001234567
);

CREATE TABLE IF NOT EXISTS message_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_name TEXT NOT NULL,
  message TEXT NOT NULL,
  send_time TEXT NOT NULL,         -- "HH:MM"
  date TEXT NOT NULL,              -- "YYYY-MM-DD"
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

module.exports = db;
