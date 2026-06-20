// app.js — DailyBot frontend logic
// Uses the browser's built-in, free, no-API-key Web Speech API for voice input.
// Works in Chrome/Android. Falls back gracefully (hides mic button) if unsupported.

const API = ""; // same origin
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------- Tab switching ----------
const tabs = document.querySelectorAll(".tab");
const navBtns = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

function switchView(name) {
  views.forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  tabs.forEach(t => t.classList.toggle("active", t.dataset.view === name));
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "summary") loadSummary();
  if (name === "people") { loadContacts(); refreshWhatsAppStatus(); }
  if (name === "today") loadToday();
}
[...tabs, ...navBtns].forEach(el => {
  el.addEventListener("click", () => switchView(el.dataset.view));
});

// ---------- Date/time field defaults ----------
document.getElementById("taskDate").value = todayStr();
document.getElementById("msgDate").value = todayStr();
document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric",
});

// ---------- WhatsApp connection status ----------
async function refreshWhatsAppStatus() {
  try {
    const res = await fetch(`${API}/api/whatsapp/status`);
    const data = await res.json();
    const pill = document.getElementById("statusPill");
    const text = document.getElementById("statusText");
    const qrArea = document.getElementById("qrArea");

    if (data.isReady) {
      pill.className = "status-pill connected";
      text.textContent = "Connected";
      qrArea.innerHTML = `<div class="form-card" style="text-align:center;">
        <p style="color:var(--sage); font-size:14px;">✓ WhatsApp linked and active</p>
      </div>`;
    } else if (data.qr) {
      pill.className = "status-pill waiting";
      text.textContent = "Scan QR";
      qrArea.innerHTML = `<div class="qr-card">
        <img src="${data.qr}" alt="WhatsApp QR code">
        <p>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device, then scan this code.</p>
      </div>`;
    } else {
      pill.className = "status-pill waiting";
      text.textContent = "Starting…";
      qrArea.innerHTML = `<div class="form-card"><p style="color:var(--paper-mute); font-size:13.5px;">Generating QR code, this can take a few seconds the first time…</p></div>`;
    }
  } catch (e) {
    document.getElementById("statusText").textContent = "Offline";
  }
}
refreshWhatsAppStatus();
setInterval(refreshWhatsAppStatus, 5000);

// ---------- Timeline (Today view) ----------
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToPercent(mins) {
  return (mins / (24 * 60)) * 100;
}
function formatTime12(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function loadToday() {
  const res = await fetch(`${API}/api/schedule?date=${todayStr()}`);
  const items = await res.json();
  const list = document.getElementById("taskList");

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Nothing scheduled for today yet. Go to <strong>Plan</strong> to add your tasks — type them or use the mic.</p></div>`;
  } else {
    list.innerHTML = items.map(item => `
      <div class="task-item" data-id="${item.id}">
        <span class="task-pin ${item.status}"></span>
        <div class="task-card">
          <div>
            <div class="task-time">${formatTime12(item.scheduled_time)}</div>
          </div>
          <div class="task-body">
            <div class="task-title">${escapeHtml(item.title)}</div>
            ${item.notes ? `<div class="task-notes">${escapeHtml(item.notes)}</div>` : ""}
          </div>
          <span class="task-status-tag ${item.status}">${item.status}</span>
        </div>
      </div>
    `).join("");
  }

  // Position "now" marker
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const pct = minutesToPercent(nowMins);
  const wrap = document.getElementById("timelineWrap");
  const marker = document.getElementById("nowMarker");
  const label = document.getElementById("nowLabel");
  const wrapHeight = wrap.offsetHeight || 400;
  const topPx = Math.max(6, Math.min(wrapHeight - 6, (pct / 100) * wrapHeight));
  marker.style.top = `${topPx}px`;
  label.style.top = `${topPx}px`;
  label.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
loadToday();
setInterval(loadToday, 30000);

// ---------- Add task ----------
document.getElementById("addTaskBtn").addEventListener("click", async () => {
  const title = document.getElementById("taskTitle").value.trim();
  const date = document.getElementById("taskDate").value;
  const time = document.getElementById("taskTime").value;
  const notes = document.getElementById("taskNotes").value.trim();

  if (!title || !date || !time) {
    alert("Please fill in what, date, and time.");
    return;
  }
  await fetch(`${API}/api/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, notes, scheduled_time: time, date }),
  });
  document.getElementById("taskTitle").value = "";
  document.getElementById("taskNotes").value = "";
  document.getElementById("taskTime").value = "";
  switchView("today");
});

// ---------- Queue message ----------
document.getElementById("queueMsgBtn").addEventListener("click", async () => {
  const contact_name = document.getElementById("msgContact").value.trim();
  const message = document.getElementById("msgText").value.trim();
  const date = document.getElementById("msgDate").value;
  const send_time = document.getElementById("msgTime").value;

  if (!contact_name || !message || !date || !send_time) {
    alert("Please fill in all fields.");
    return;
  }
  const res = await fetch(`${API}/api/messages/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_name, message, send_time, date }),
  });
  if (res.ok) {
    document.getElementById("msgContact").value = "";
    document.getElementById("msgText").value = "";
    document.getElementById("msgTime").value = "";
    alert("Message queued.");
  } else {
    const err = await res.json();
    alert("Error: " + err.error);
  }
});

// ---------- Summary view ----------
async function loadSummary() {
  const res = await fetch(`${API}/api/logs/summary?date=${todayStr()}`);
  const data = await res.json();
  document.getElementById("statTotal").textContent = data.totalTasks;
  document.getElementById("statDone").textContent = data.completed;
  document.getElementById("statRate").textContent = `${data.completionRate}%`;

  const logList = document.getElementById("logList");
  if (data.logEntries.length === 0) {
    logList.innerHTML = `<p style="color:var(--paper-mute); font-size:13.5px;">No entries yet today.</p>`;
  } else {
    logList.innerHTML = data.logEntries.map(l => `
      <div class="log-entry">
        <div class="log-meta">${l.entry_type === "work_log" ? "Work log" : "Reflection"} · ${new Date(l.created_at + "Z").toLocaleTimeString("en-US", {hour:"numeric", minute:"2-digit"})}</div>
        ${escapeHtml(l.content)}
      </div>
    `).join("");
  }
}

document.getElementById("addLogBtn").addEventListener("click", async () => {
  const content = document.getElementById("logText").value.trim();
  if (!content) return;
  await fetch(`${API}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: todayStr(), entry_type: "work_log", content }),
  });
  document.getElementById("logText").value = "";
  loadSummary();
});

// ---------- Contacts ----------
async function loadContacts() {
  const res = await fetch(`${API}/api/contacts`);
  const contacts = await res.json();
  const list = document.getElementById("contactList");
  if (contacts.length === 0) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = contacts.map(c => `
    <div class="contact-row"><span>${escapeHtml(c.name)}</span><span class="phone">${c.phone}</span></div>
  `).join("");
}

document.getElementById("addContactBtn").addEventListener("click", async () => {
  const name = document.getElementById("contactName").value.trim();
  const phone = document.getElementById("contactPhone").value.trim().replace(/[^0-9]/g, "");
  if (!name || !phone) {
    alert("Enter both name and number.");
    return;
  }
  await fetch(`${API}/api/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone }),
  });
  document.getElementById("contactName").value = "";
  document.getElementById("contactPhone").value = "";
  loadContacts();
});

document.getElementById("testBtn").addEventListener("click", async () => {
  const res = await fetch(`${API}/api/whatsapp/test`, { method: "POST" });
  if (res.ok) {
    alert("Test message sent — check your WhatsApp.");
  } else {
    const err = await res.json();
    alert("Failed: " + err.error);
  }
});

// ---------- Voice input (free, built into the browser — no API key) ----------
function setupVoiceInput(btnId, hintId, targetFieldId) {
  const btn = document.getElementById(btnId);
  const hint = document.getElementById(hintId);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    btn.style.display = "none";
    hint.textContent = "Voice input isn't supported in this browser — please type instead.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let listening = false;

  btn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      listening = true;
      btn.classList.add("listening");
      hint.textContent = "Listening… speak now";
    } catch (e) {
      hint.textContent = "Mic already active or blocked — check browser permissions.";
    }
  });

  recognition.addEventListener("result", (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const field = document.getElementById(targetFieldId);
    field.value = transcript;
  });

  recognition.addEventListener("end", () => {
    listening = false;
    btn.classList.remove("listening");
    hint.textContent = "Tap mic and speak, or type";
  });

  recognition.addEventListener("error", (e) => {
    listening = false;
    btn.classList.remove("listening");
    hint.textContent = e.error === "not-allowed" ? "Mic permission denied — enable it in browser settings." : "Couldn't hear that, try again.";
  });
}
setupVoiceInput("micBtnTask", "micHintTask", "taskTitle");
setupVoiceInput("micBtnLog", "micHintLog", "logText");

// ---------- Live WebSocket connection for escalation alarms ----------
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}`);

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "ESCALATE") {
      triggerAlarm(data.title);
    } else if (data.type === "ACK") {
      loadToday();
    }
  });

  ws.addEventListener("close", () => {
    setTimeout(connectWS, 3000); // auto-reconnect
  });
}
connectWS();

// ---------- Alarm overlay (loud, repeating, full-screen) ----------
const alarmOverlay = document.getElementById("alarmOverlay");
const alarmSound = document.getElementById("alarmSound");
const alarmTitle = document.getElementById("alarmTitle");
const alarmText = document.getElementById("alarmText");

function triggerAlarm(taskTitle) {
  alarmTitle.textContent = "No response";
  alarmText.textContent = `You didn't respond to "${taskTitle}" within 5 minutes.`;
  alarmOverlay.classList.add("show");
  alarmSound.currentTime = 0;
  alarmSound.play().catch(() => {
    // Autoplay may be blocked until the user interacts with the page once.
    // The visual alarm still shows even if sound is blocked.
  });

  // Also try a browser notification (works even if app is backgrounded, if permitted)
  if (Notification.permission === "granted") {
    new Notification("⏰ No response", { body: `You didn't respond to "${taskTitle}"`, requireInteraction: true });
  }

  loadToday();
}

document.getElementById("alarmDismiss").addEventListener("click", () => {
  alarmOverlay.classList.remove("show");
  alarmSound.pause();
  alarmSound.currentTime = 0;
});

// Ask for notification permission once, on first interaction
document.body.addEventListener("click", function requestNotifOnce() {
  if (Notification && Notification.permission === "default") {
    Notification.requestPermission();
  }
  document.body.removeEventListener("click", requestNotifOnce);
}, { once: true });

// Register service worker for installability (PWA "Add to Home Screen")
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
