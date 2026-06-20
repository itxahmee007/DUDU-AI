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

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: require("path").join(__dirname, "..", "data", "wwebjs_auth") }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
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
