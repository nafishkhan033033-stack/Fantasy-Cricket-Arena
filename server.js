require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "arena.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 wallet_paise INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 razorpay_order_id TEXT NOT NULL UNIQUE,
 razorpay_payment_id TEXT UNIQUE,
 amount_paise INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'created',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS teams (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 team_name TEXT NOT NULL,
 players_json TEXT NOT NULL,
 captain TEXT NOT NULL,
 vice_captain TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const razorpayReady = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = razorpayReady ? new Razorpay({
 key_id: process.env.RAZORPAY_KEY_ID,
 key_secret: process.env.RAZORPAY_KEY_SECRET
}) : null;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
 store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
 secret: process.env.SESSION_SECRET || "dev-only-change-this-secret-before-deploying",
 resave: false,
 saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

function safeUser(row) {
 return row ? { id: row.id, name: row.name, email: row.email, walletPaise: row.wallet_paise } : null;
}
function requireAuth(req, res, next) {
 if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
 next();
}
function getUser(id) { return db.prepare("SELECT * FROM users WHERE id = ?").get(id); }

app.get("/api/config", (req, res) => res.json({
 razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
 paymentsConfigured: razorpayReady
}));
app.get("/api/me", (req, res) => res.json({ user: safeUser(req.session.userId ? getUser(req.session.userId) : null) }));

app.post("/api/register", async (req, res) => {
 try {
  const name = String(req.body.name || "").trim().slice(0, 60);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
   return res.status(400).json({ error: "Name, valid email, and password (8+ characters) are required." });
  }
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)").run(name, email, hash);
  req.session.userId = Number(info.lastInsertRowid);
  res.json({ user: safeUser(getUser(req.session.userId)) });
 } catch (e) {
  if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "This email is already registered." });
  console.error(e); res.status(500).json({ error: "Could not create account." });
 }
});
app.post("/api/login", async (req, res) => {
 const email = String(req.body.email || "").trim().toLowerCase();
 const password = String(req.body.password || "");
 const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
 if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
 req.session.userId = user.id;
 res.json({ user: safeUser(user) });
});
app.post("/api/logout", (req, res) => {
 req.session.destroy(err => {
  if (err) return res.status(500).json({ error: "Logout failed." });
  res.clearCookie("connect.sid"); res.json({ ok: true });
 });
});

app.get("/api/teams", requireAuth, (req, res) => {
 const rows = db.prepare("SELECT id,team_name,players_json,captain,vice_captain,created_at FROM teams WHERE user_id=? ORDER BY id DESC").all(req.session.userId);
 res.json({ teams: rows.map(t => ({ ...t, players: JSON.parse(t.players_json) })) });
});
app.post("/api/teams", requireAuth, (req, res) => {
 const teamName = String(req.body.teamName || "My Team").trim().slice(0, 40);
 const players = req.body.players;
 const captain = String(req.body.captain || "");
 const viceCaptain = String(req.body.viceCaptain || "");
 if (!Array.isArray(players) || players.length !== 11 || new Set(players).size !== 11 || !players.includes(captain) || !players.includes(viceCaptain) || captain === viceCaptain) {
  return res.status(400).json({ error: "Choose 11 unique players and different captain/vice-captain." });
 }
 const info = db.prepare("INSERT INTO teams (user_id,team_name,players_json,captain,vice_captain) VALUES (?,?,?,?,?)")
  .run(req.session.userId, teamName, JSON.stringify(players), captain, viceCaptain);
 res.json({ id: Number(info.lastInsertRowid), ok: true });
});
app.delete("/api/teams/:id", requireAuth, (req, res) => {
 const info = db.prepare("DELETE FROM teams WHERE id=? AND user_id=?").run(Number(req.params.id), req.session.userId);
 if (!info.changes) return res.status(404).json({ error: "Team not found." });
 res.json({ ok: true });
});

app.post("/api/payments/order", requireAuth, async (req, res) => {
 if (!razorpayReady) return res.status(503).json({ error: "Payments are not configured. Add Razorpay test keys to .env first." });
 const rupees = Number(req.body.amount);
 if (!Number.isInteger(rupees) || rupees < 10 || rupees > 5000) return res.status(400).json({ error: "Enter an amount from ₹10 to ₹5,000." });
 try {
  const order = await razorpay.orders.create({ amount: rupees * 100, currency: "INR", receipt: `u${req.session.userId}-${Date.now()}`, notes: { userId: String(req.session.userId) } });
  db.prepare("INSERT INTO payments (user_id,razorpay_order_id,amount_paise,status) VALUES (?,?,?,'created')")
    .run(req.session.userId, order.id, order.amount);
  res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, name: "Fantasy Cricket Arena" });
 } catch (e) { console.error(e); res.status(502).json({ error: "Could not create payment order." }); }
});
app.post("/api/payments/verify", requireAuth, (req, res) => {
 if (!razorpayReady) return res.status(503).json({ error: "Payments are not configured." });
 const orderId = String(req.body.razorpay_order_id || "");
 const paymentId = String(req.body.razorpay_payment_id || "");
 const signature = String(req.body.razorpay_signature || "");
 const payment = db.prepare("SELECT * FROM payments WHERE razorpay_order_id=? AND user_id=?").get(orderId, req.session.userId);
 if (!payment || payment.status === "paid") return res.status(400).json({ error: "Invalid or already processed order." });
 const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
 const a = Buffer.from(expected); const b = Buffer.from(signature);
 if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "Payment signature verification failed." });
 const tx = db.transaction(() => {
  const changed = db.prepare("UPDATE payments SET razorpay_payment_id=?,status='paid' WHERE id=? AND status='created'").run(paymentId, payment.id);
  if (!changed.changes) throw new Error("Payment already processed");
  db.prepare("UPDATE users SET wallet_paise=wallet_paise+? WHERE id=?").run(payment.amount_paise, req.session.userId);
 });
 try { tx(); res.json({ ok: true, user: safeUser(getUser(req.session.userId)) }); }
 catch (e) { console.error(e); res.status(409).json({ error: "Payment was already processed." }); }
});
app.get("/api/payments/history", requireAuth, (req, res) => {
 const rows = db.prepare("SELECT amount_paise,status,created_at FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.session.userId);
 res.json({ payments: rows });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Fantasy Cricket Arena running at http://localhost:${PORT}`));
