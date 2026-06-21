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
