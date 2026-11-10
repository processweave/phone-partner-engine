const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_API_KEY = process.env.BOT_API_KEY || 'change-me-in-production';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-change-me';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const db = new sqlite3.Database(path.join(__dirname, 'phone-partner.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    state TEXT,
    contact TEXT,
    dailyCapacity INTEGER DEFAULT 0,
    interest TEXT,
    notes TEXT,
    status TEXT DEFAULT 'prospect',
    lastContact TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    action TEXT,
    entityType TEXT,
    entityId TEXT,
    details TEXT,
    actor TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT DEFAULT 'pending_approval',
    storeIds TEXT,
    approvedAt TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_phone ON stores(phone) WHERE phone IS NOT NULL AND phone != ''`);
});

function logActivity(action, entityType, entityId, details, actor = 'system') {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO activity_log (id, action, entityType, entityId, details, actor) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, action, entityType, entityId, JSON.stringify(details), actor]
  );
}

function authBot(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== BOT_API_KEY && key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.actor = key === ADMIN_API_KEY ? 'admin' : 'bot';
  next();
}

function authAdmin(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== ADMIN_API_KEY) return res.status(403).json({ error: 'Admin only' });
  req.actor = 'admin';
  next();
}

app.post('/api/stores', authBot, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : (req.body.stores || [req.body]);
  const results = [];
  let pending = items.length;
  if (pending === 0) return res.json({ imported: 0, results: [] });

  items.forEach(item => {
    if (!item.name || !item.phone) {
      results.push({ name: item.name, status: 'skipped', reason: 'missing name or phone' });
      if (--pending === 0) finish();
      return;
    }
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO stores (id, name, phone, city, state, contact, dailyCapacity, interest, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         name=excluded.name, city=excluded.city, state=excluded.state,
         contact=COALESCE(excluded.contact, contact),
         dailyCapacity=COALESCE(excluded.dailyCapacity, dailyCapacity),
         interest=COALESCE(excluded.interest, interest),
         notes=COALESCE(excluded.notes, notes),
         status=COALESCE(excluded.status, status),
         updatedAt=CURRENT_TIMESTAMP`,
      [id, item.name, item.phone, item.city || '', item.state || '', item.contact || '',
       item.dailyCapacity || item.capacity || 0, item.interest || '', item.notes || item.note || '',
       item.status || 'prospect'],
      function (err) {
        if (err) {
          results.push({ name: item.name, phone: item.phone, status: 'error', error: err.message });
        } else {
          const action = this.changes ? 'upsert' : 'insert';
          logActivity(action, 'store', id, { name: item.name, phone: item.phone }, req.actor);
          results.push({ name: item.name, phone: item.phone, status: action, id });
        }
        if (--pending === 0) finish();
      }
    );
  });

  function finish() {
    res.json({ imported: results.filter(r => r.status !== 'skipped' && r.status !== 'error').length, results });
  }
});

app.get('/api/stores', (req, res) => {
  db.all(`SELECT * FROM stores ORDER BY updatedAt DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Phone Partner Engine API running on port ${PORT}`);
});
