import express from "express";
import dotenv from "dotenv";
import fs from "fs";

const TOKENS_FILE = "./tokens.json";
function loadTokens() {
  try { return new Set(JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"))); }
  catch { return new Set(); }
}
function saveTokens(set) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify([...set]), "utf8");
}

const deviceTokens = loadTokens();


dotenv.config();
const app = express();
app.use(express.json({ limit: "2mb" }));

// Stores your phone's Expo push tokens (for v1 personal use)

/**
 * Mobile app registers its Expo push token here.
 * Body: { token: "ExponentPushToken[...]" }
 */
app.post("/devices/register", (req, res) => {
  const token = req.body?.token;
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Missing token" });
  deviceTokens.add(token);
  saveTokens(deviceTokens);
  res.json({ ok: true, count: deviceTokens.size });
});

/**
 * Fanvue webhook endpoint
 * You will paste this URL into Fanvue Webhooks settings.
 */
app.post("/webhooks/fanvue/:token", async (req, res) => {
  if (req.params.token !== process.env.WEBHOOK_TOKEN) return res.sendStatus(401);

  const event = req.body || {};

  // Respond to Fanvue quickly
  res.sendStatus(200);

  const message = formatEvent(event);

  // Send push notification to all registered devices
  if (deviceTokens.size > 0) {
    await sendExpoPush([...deviceTokens], {
      title: process.env.APP_NAME || "Fanvue Alerts",
      body: message,
      data: { event },
    });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/test/push/:token", async (req, res) => {
  if (req.params.token !== process.env.WEBHOOK_TOKEN) return res.sendStatus(401);

  const body = req.body || {};
  const title = body.title || process.env.APP_NAME || "Fanvue Alerts";
  const message = body.body || "Test push from your backend ✅";

  if (deviceTokens.size === 0) {
    return res.status(400).json({ ok: false, error: "No device tokens registered yet. Open the mobile app first." });
  }

  await sendExpoPush([...deviceTokens], {
    title,
    body: message,
    data: { test: true },
  });

  res.json({ ok: true, sentTo: deviceTokens.size });
});


const port = Number(process.env.PORT || 8081);
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));

function formatEvent(e) {
  const sender = e?.sender?.displayName || e?.sender?.handle || "Someone";

  // Common webhook example fields; messageUuid is used in message example payloads
  if (e?.messageUuid) return `📩 New message from ${sender}`;

  // If there's a money amount (minor units), show it
  if (typeof e?.price === "number") return `💸 Payment event €${(e.price / 100).toFixed(2)} from ${sender}`;

  // Generic fallback for follower/subscriber etc.
  return `✨ New Fanvue event from ${sender}`;
}

async function sendExpoPush(tokens, message) {
  const batches = chunk(tokens, 100);

  for (const batch of batches) {
    const payload = batch.map((to) => ({ to, ...message }));

    try {
      const r = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        console.log("Expo push HTTP error:", r.status, data);
      } else {
        // Expo returns per-token receipts in `data.data`
        // Log any per-token errors like "DeviceNotRegistered"
        const results = data?.data || [];
        for (const item of results) {
          if (item?.status === "error") {
            console.log("Expo push token error:", item);
          }
        }
      }
    } catch (err) {
      console.log("Expo push request failed:", err);
    }
  }
}

app.get("/", (_req, res) => res.send("Fanvue Push Backend running"));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

