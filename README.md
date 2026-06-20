# DailyBot — Setup Guide

A personal schedule + WhatsApp reminder assistant. Runs on your own machine
or a free-tier server. No paid AI API, no Meta Business API costs — uses
your own WhatsApp account (linked once via QR code, like WhatsApp Web) and
your phone's built-in voice recognition (free, no API key).

## What this actually does

- You add tasks with a time (type or speak them) in the **Plan** tab.
- At the exact scheduled time, it sends YOU a WhatsApp message.
- If you don't reply within 5 minutes, it triggers a loud, full-screen
  alarm inside the web app (sound + visual + browser notification) and
  sends you a WhatsApp follow-up.
- You can log daily work notes and see a simple end-of-day summary.
- You can queue a message to a saved contact for a specific time.

## Important honesty notes (please read)

1. **WhatsApp cannot make outgoing calls automatically** — not for this
   app, not for any app. That part of your original ask isn't possible on
   WhatsApp's platform at all. The loud alarm-overlay-in-the-app is the
   real substitute we built instead.
2. **This needs a server running 24/7** to message you even when you're
   not in the app. Your phone/laptop sleeping is not enough. See hosting
   options below — there are free ones suitable for one person's use.
3. **This uses an unofficial WhatsApp connection method** (the same
   approach as WhatsApp Web), not Meta's official paid Business API. It's
   how most personal WhatsApp bots work, but it's not officially sanctioned
   by Meta for automated/business use, and in rare cases accounts that send
   high volumes of automated messages can get temporarily limited. For your
   personal, low-volume use (reminders to yourself + occasional messages to
   a few contacts) the practical risk is low, but it's worth knowing.
4. **The AI part is you** — there's no paid AI model running in the
   background (since that needs an API key with real cost). The "summary"
   feature gives you raw counts and your own logged notes. If you want an
   AI-written summary or analysis, just paste your daily log into a Claude
   chat (free) — that's the smart way to get AI-level insight without
   paying for an API key for a low-volume personal tool.

## Requirements

- A computer (Windows/Mac/Linux) or a free-tier cloud server, with
  **Node.js 18 or newer** installed.
- Your own WhatsApp account on your phone, ready to scan a QR code.
- Google Chrome (desktop or Android) recommended for the voice-input mic
  feature — Web Speech API support varies by browser; Chrome has the best
  support. iPhone Safari support for the mic feature is limited.

## Step 1 — Install dependencies

Open a terminal in this project folder and run:

```bash
npm install
```

This downloads everything needed: Express (web server), whatsapp-web.js
(the WhatsApp connection), better-sqlite3 (local database — your data
never leaves your machine), node-cron (the scheduler), and a couple of
small helpers.

## Step 2 — Start the server

```bash
npm start
```

You'll see in the terminal:
```
[server] DailyBot running on http://localhost:3000
[whatsapp] New QR code generated. Open the web app to scan it.
```

## Step 3 — Open the app and link WhatsApp

1. On the same machine, open `http://localhost:3000` in Chrome.
2. If you're testing from your phone instead, replace `localhost` with
   your computer's local IP address (e.g. `http://192.168.1.20:3000`) —
   find this with `ipconfig` (Windows) or `ifconfig`/`ip a` (Mac/Linux).
3. Go to the **People** tab — a QR code will appear.
4. On your phone: WhatsApp → Settings → Linked Devices → Link a Device →
   scan the QR code.
5. Once linked, the status pill at the top turns green and says
   "Connected." Tap **Send myself a test WhatsApp message** to confirm.

## Step 4 — Add this app to your phone's home screen (feels like a real app)

**On Android (Chrome):** open the app's URL → tap the ⋮ menu → "Add to
Home screen" / "Install app."

**On iPhone (Safari):** open the app's URL → tap the Share icon → "Add to
Home Screen."

It will now open full-screen with its own icon, no browser bar — exactly
like a native app, with zero app-store approval needed.

## Step 5 (important) — Keep it running 24/7

If you close the terminal or turn off your computer, the bot stops working
in the background — it can only send reminders while `npm start` is
actively running somewhere.

**Two realistic options:**

**A. Leave a computer running** (simplest, free, but ties up a machine):
Keep the terminal open and your computer awake/connected to the internet.
Fine for testing or if you have a spare always-on PC.

**B. Free-tier cloud hosting** (recommended for real daily use):
Services like Railway, Render, or Fly.io offer free or near-free tiers
where your code runs on their always-on servers instead of your own
machine. The general steps (I'm happy to walk through whichever you pick,
in detail, once you choose):
1. Create a free account on the host.
2. Connect your project (they usually support uploading a zip or
   connecting a GitHub repo).
3. Set the start command to `npm start`.
4. **Important caveat:** because this app uses a headless Chrome browser
   internally (that's how whatsapp-web.js works), the free tier needs to
   support that — Railway and Render's free tiers generally do, but you
   may need to add a small config tweak (a "buildpack" or Dockerfile) to
   install Chromium dependencies. I can write that exact config for you
   once you tell me which host you pick.
5. After deploying, you'll get a permanent URL (e.g.
   `yourapp.up.railway.app`) instead of `localhost` — use that to open the
   app and re-scan the WhatsApp QR code once (linked sessions are saved on
   the server, so you won't need to rescan again after that).

## Data & privacy

All your schedule, logs, and contacts are stored in a local SQLite file at
`/data/dailybot.sqlite` — nothing is sent to any third party, no cloud
database, no analytics. Your WhatsApp session is stored locally at
`/data/wwebjs_auth` so you don't have to rescan the QR code every restart.

## File structure

```
dailybot/
├── package.json
├── server/
│   ├── index.js       # main server, REST API, WebSocket
│   ├── db.js          # local SQLite database setup
│   ├── whatsapp.js     # WhatsApp connection (QR login, sending messages)
│   └── scheduler.js    # checks schedule every minute, handles escalation
├── public/
│   ├── index.html      # the app UI
│   ├── app.js          # frontend logic, voice input, alarm handling
│   ├── manifest.json    # PWA install config
│   ├── sw.js            # service worker (enables "Add to Home Screen")
│   ├── alarm.wav         # the escalation alarm sound
│   └── icon.png          # app icon
└── data/                  # created automatically — your local database & WhatsApp session
```

## If something doesn't work

- **QR code never appears:** wait 15-20 seconds on first run — it
  launches a hidden browser internally, which takes a moment.
- **"Module not found" errors:** re-run `npm install`.
- **Messages not sending at the right time:** confirm the server's system
  clock/timezone matches your local time (`date` command in terminal).
- **Mic button missing:** your browser doesn't support Web Speech API —
  use Chrome, or just type instead.
