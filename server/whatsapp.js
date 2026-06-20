// whatsapp.js
// Connects to YOUR OWN WhatsApp account, the same way WhatsApp Web does
// (scan a QR code once, session is then saved locally so you don't re-scan
// every restart). No Meta Business API, no third-party WhatsApp service, no
// recurring cost — this uses the open-source whatsapp-web.js library which
// drives a real, hidden WhatsApp Web browser session on your server.
//
// IMPORTANT HONESTY NOTE (kept in code on purpose):
// This is NOT WhatsApp's official Business API. It is the same approach
// used by thousands of personal/small-scale WhatsApp bots. It can break if
// WhatsApp changes their web client, and using automated bots is technically
// against WhatsApp's Terms of Service for business/automated use at scale.
// For a personal, low-volume, message-yourself-and-a-few-contacts use case
// like this one, the realistic risk is low, but it is not zero. If WhatsApp
// ever flags/limits the linked account, that's the trade-off of avoiding
// paid official APIs.

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

let latestQR = null;     // base64 PNG data URL of current QR, for the web UI
let isReady = false;
let myNumber = null;     // your own WhatsApp number, detected after login, e.g. "923001234567@c.us"

let onIncomingMessage = () => {}; // callback set by index.js

// Find the real Chromium binary path installed by nixpacks.toml on Railway.
// Nix installs packages into auto-generated hashed folders like
// /nix/store/abc123-chromium-XX/bin/chromium, so we can't hardcode the path —
// instead we search common locations and the chromium-browser/which command.
function findChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  const { execSync } = require("child_process");
  const candidates = ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"];

  for (const bin of candidates) {
    try {
      const found = execSync(`which ${bin} 2>/dev/null`).toString().trim();
      if (found) return found;
    } catch (e) {
      // not found, try next
    }
  }

  // Fallback: search the Nix store directly for a chromium binary
  try {
    const found = execSync(
      `find /nix/store -maxdepth 4 -type f -name chromium -path "*/bin/*" 2>/dev/null | head -n 1`
    ).toString().trim();
    if (found) return found;
  } catch (e) {
    // ignore
  }

  return undefined; // let Puppeteer fall back to its own bundled Chromium (local dev)
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: require("path").join(__dirname, "..", "data", "wwebjs_auth") }),
  puppeteer: {
    headless: true,
    executablePath: (() => {
      const p = findChromiumPath();
      console.log("[whatsapp] Using Chromium executable path:", p || "(none found — using Puppeteer's bundled default)");
      return p;
    })(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
    ],
  },
});

client.on("qr", async (qr) => {
  latestQR = await qrcode.toDataURL(qr);
  isReady = false;
  console.log("[whatsapp] New QR code generated. Open the web app to scan it.");
});

client.on("ready", () => {
  isReady = true;
  latestQR = null;
  myNumber = client.info?.wid?._serialized || null;
  console.log("[whatsapp] Connected and ready. Linked as:", myNumber);
});

client.on("disconnected", (reason) => {
  isReady = false;
  console.log("[whatsapp] Disconnected:", reason);
});

// Listen for YOUR replies (so we can detect acknowledgements to reminders)
client.on("message", (msg) => {
  // Only care about messages in your own chat-with-yourself (Notes-to-self)
  // OR messages sent BY you from another linked device, depending on setup.
  onIncomingMessage(msg);
});

function setIncomingMessageHandler(fn) {
  onIncomingMessage = fn;
}

function getStatus() {
  return { isReady, myNumber, qr: latestQR };
}

async function sendToSelf(message) {
  if (!isReady || !myNumber) throw new Error("WhatsApp not connected yet");
  await client.sendMessage(myNumber, message);
}

async function sendToNumber(internationalNumberNoPlus, message) {
  if (!isReady) throw new Error("WhatsApp not connected yet");
  const chatId = `${internationalNumberNoPlus}@c.us`;
  await client.sendMessage(chatId, message);
}

function init() {
  client.initialize();
}

module.exports = {
  init,
  getStatus,
  sendToSelf,
  sendToNumber,
  setIncomingMessageHandler,
};
