const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 8765;

const APP_PASSWORD = process.env.APP_PASSWORD || "unalcomedor";
const CLOUD_SCRIPT_URL = (process.env.CLOUD_SCRIPT_URL || "").trim();
// se reenvía a Apps Script para autorizar escrituras
const CLOUD_PASSWORD = process.env.CLOUD_PASSWORD || APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");
const COOKIE_NAME = "comedor_auth";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

app.use(express.json({ limit: "12mb" }));
app.use(express.text({ type: "text/plain", limit: "12mb" }));
app.use(cookieParser(SESSION_SECRET));

function makeToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const raw = `${exp}.${crypto.randomBytes(24).toString("hex")}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(raw).digest("hex");
  return `${raw}.${sig}`;
}

function validToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, rnd, sig] = parts;
  const raw = `${exp}.${rnd}`;
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(raw).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  if (Number(exp) < Date.now()) return false;
  return true;
}

function isAuthed(req) {
  return validToken(req.signedCookies[COOKIE_NAME] || req.cookies[COOKIE_NAME]);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cloud: !!CLOUD_SCRIPT_URL });
});

app.get("/api/me", (req, res) => {
  res.json({ ok: true, authed: isAuthed(req), cloudConfigured: !!CLOUD_SCRIPT_URL });
});

app.post("/api/login", (req, res) => {
  const password = (req.body && req.body.password) || "";
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
  }
  const token = makeToken();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT,
    signed: true,
    maxAge: TOKEN_TTL_MS
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "No autenticado" });
  next();
}

async function forwardToCloud(payload) {
  if (!CLOUD_SCRIPT_URL) {
    return { ok: false, error: "CLOUD_SCRIPT_URL no configurada en el servidor", queued: true };
  }
  const res = await fetch(CLOUD_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, password: CLOUD_PASSWORD }),
    redirect: "follow"
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (data && data.ok) return data;
  if (res.ok) return { ok: true, raw: text };
  throw new Error((data && data.error) || `cloud_fail_${res.status}`);
}

app.post("/api/sync", requireAuth, async (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (_) {}
    }
    const result = await forwardToCloud(payload);
    if (!result.ok && result.queued) {
      return res.status(503).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err.message || err) });
  }
});

// Estáticos solo si está autenticado (excepto login assets inline en index)
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/index.html" || req.path.startsWith("/assets/")) {
    return next();
  }
  next();
});

const staticDir = path.join(__dirname, "docs");

app.use(express.static(staticDir, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.get("*", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Comedor app on :${PORT}`);
  console.log(`Cloud sync: ${CLOUD_SCRIPT_URL ? "ON" : "OFF (set CLOUD_SCRIPT_URL)"}`);
});
