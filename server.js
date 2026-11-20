/**
 * KEEP — один сервер, встроенная БД (data/db.json)
 * npm install && npm start → http://localhost:3000
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'keep.it.official.001@gmail.com').toLowerCase();
const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
const ROLES = ['user', 'manager', 'admin', 'viewer'];
const COOKIE = 'keep_sid';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const MAX_FILE = 5 * 1024 * 1024; // 5MB

const DEFAULT_SERVICES = [
  { id: 'site', name: 'Сайт', icon: 'globe', color: '#3b82f6' },
  { id: 'app', name: 'Приложение', icon: 'phone', color: '#8b5cf6' },
  { id: 'webapp', name: 'Веб-приложение', icon: 'layers', color: '#10b981' },
  { id: 'other', name: 'Другое', icon: 'sparkles', color: '#f59e0b' },
  { id: 'question', name: 'Общий вопрос', icon: 'help', color: '#6b7280' }
];

const DEFAULT_PROMOS = {
  EmirDI1804: { type: 'role', role: 'admin', label: 'Админ-доступ', once: true },
  KEEP10: { type: 'discount', value: 10, label: 'Скидка 10%', once: true },
  FREECONSULT: { type: 'consult', label: 'Бесплатная консультация', once: true },
  PRIORITY: { type: 'priority', label: 'Приоритет в очереди', once: true }
};

const QUICK_REPLIES = [
  'Здравствуйте! Заявку приняли, свяжемся в течение дня.',
  'Нужны дополнительные детали по задаче. Можете уточнить?',
  'Работа по вашей заявке начата.',
  'Готово! Проверьте результат и напишите, если нужны правки.',
  'Спасибо за оценку! Будем рады помочь снова.'
];

const DEFAULT_CONTENT = [{"n": "Сайт", "t": "3–10 дней", "l": "Создаём сайты, которые быстро загружаются, хорошо выглядят на любом экране и приводят клиентов. Подходят для презентации бизнеса, продаж и сбора заявок.", "p": [["Уникальный дизайн", "Интерфейс под ваш бренд, а не шаблон"], ["Адаптивная вёрстка", "Телефон, планшет и компьютер"], ["SEO и скорость", "Быстрая загрузка и видимость в поиске"], ["Формы и аналитика", "Заявки, метрики, подключение домена"], ["Управление контентом", "Простая панель для правок без программиста"], ["Безопасность", "HTTPS, защита форм и резервные копии"]], "k": ["HTML", "CSS", "JavaScript", "React", "WordPress"], "rd": "Лендинги, корпоративные сайты и интернет-магазины.", "from": "3–10 дней"}, {"n": "Приложение", "t": "3–10 дней", "l": "Разрабатываем мобильные приложения для iOS и Android: от прототипа и дизайна до публикации в магазинах и дальнейшей поддержки.", "p": [["Прототип и дизайн", "Сценарии пользователя и живой интерфейс"], ["iOS и Android", "Одно решение для обеих платформ"], ["Аккаунты и оплата", "Авторизация, подписки, платежи"], ["Push-уведомления", "Возвращайте пользователей вовремя"], ["Публикация", "App Store и Google Play под ключ"], ["Поддержка", "Обновления и исправления после релиза"]], "k": ["Swift", "Kotlin", "Flutter", "React Native", "Firebase"], "rd": "Мобильные приложения для iOS и Android.", "from": "3–10 дней"}, {"n": "Веб-приложение", "t": "3–10 дней", "l": "Строим сервисы, которые работают прямо в браузере: личные кабинеты, CRM, панели управления и внутренние системы, способные расти вместе с бизнесом.", "p": [["Личные кабинеты", "Роли, права доступа, вход по почте"], ["CRM и дашборды", "Данные и отчёты в одном месте"], ["Интеграции", "Платежи, почта, внешние API"], ["Безопасность", "Шифрование и резервное копирование"], ["Масштабирование", "Выдержит рост нагрузки и команды"], ["Облачный запуск", "Развёртывание и мониторинг"]], "k": ["React", "Node.js", "Python", "PostgreSQL", "Docker"], "rd": "Личные кабинеты, CRM и сервисы в браузере.", "from": "3–10 дней"}];

// ========== DB ==========
let DB = {
  users: [], sessions: [], orders: [], services: [], content: [], contentV: 2, promos: {},
  logs: [], seq: { users: 0, orders: 0, comments: 0, files: 0 }
};

function loadDB() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  try {
    const j = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    DB = {
      users: j.users || [],
      sessions: j.sessions || [],
      orders: j.orders || [],
      services: j.services && j.services.length ? j.services : DEFAULT_SERVICES.slice(),
      content: Array.isArray(j.content) && j.content.length ? j.content : JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
      contentV: 2,
      promos: j.promos && Object.keys(j.promos).length ? j.promos : { ...DEFAULT_PROMOS },
      logs: j.logs || [],
      seq: j.seq || { users: 0, orders: 0, comments: 0, files: 0 }
    };
    if (j.contentV !== 2) { DB.content.forEach(c => { c.t = '3–10 дней'; c.from = '3–10 дней'; }); saveDB(); }
    ['users','orders','comments','files'].forEach(k => { if (typeof DB.seq[k] !== 'number') DB.seq[k] = 0; });
  } catch {
    DB.services = DEFAULT_SERVICES.slice();
    DB.content = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
    DB.promos = { ...DEFAULT_PROMOS };
    saveDB();
  }
  // daily backup
  try {
    const bak = path.join(DATA_DIR, 'db.' + new Date().toISOString().slice(0, 10) + '.bak');
    if (!fs.existsSync(bak) && fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, bak);
  } catch {}
  console.log('БД:', DB_FILE);
}

function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB));
  fs.renameSync(tmp, DB_FILE);
}

function logAction(userId, action, meta) {
  DB.logs.unshift({ at: new Date().toISOString(), userId, action, meta: meta || null });
  if (DB.logs.length > 500) DB.logs.length = 500;
  saveDB();
}

function pubUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    favorites: u.favorites || [], referral: u.referral || null,
    created_at: u.created_at
  };
}

function createUser({ name, email, pass, role }) {
  if (DB.users.some(u => u.email === email)) throw new Error('exists');
  const ref = crypto.randomBytes(4).toString('hex');
  const u = {
    id: ++DB.seq.users, name, email, pass,
    role: role || 'user',
    favorites: [],
    referral: ref,
    usedPromos: [],
    resetCode: null,
    created_at: new Date().toISOString()
  };
  DB.users.push(u);
  saveDB();
  return pubUser(u);
}

function getUserByEmail(email) {
  return DB.users.find(u => u.email === email) || null;
}
function getUserById(id) {
  return DB.users.find(u => u.id === id) || null;
}

function createSession(token, userId, days = 30) {
  const now = Date.now();
  DB.sessions = DB.sessions.filter(s => s.exp > now);
  DB.sessions.push({ token, user_id: userId, exp: now + days * 864e5 });
  saveDB();
}
function getSessionUser(token) {
  const s = DB.sessions.find(x => x.token === token && x.exp > Date.now());
  if (!s) return null;
  return pubUser(getUserById(s.user_id));
}
function deleteSession(token) {
  DB.sessions = DB.sessions.filter(s => s.token !== token);
  saveDB();
}

function createOrder(data) {
  const o = {
    id: ++DB.seq.orders,
    user_id: data.user_id || null,
    name: data.name,
    email: data.email,
    service: data.service,
    message: data.message,
    status: 'new',
    priority: data.priority || false,
    discount: data.discount || 0,
    comments: [],
    files: [],
    history: [{ at: new Date().toISOString(), status: 'new', by: data.user_id || null, byName: data.name || 'Гость' }],
    rating: null,
    review: null,
    unreadUser: false,
    unreadAdmin: true,
    created_at: new Date().toISOString()
  };
  DB.orders.push(o);
  saveDB();
  return sanitizeOrder(o, false);
}

function sanitizeOrder(o, isAdmin) {
  return {
    id: o.id,
    user_id: o.user_id,
    name: o.name,
    email: o.email,
    service: o.service,
    message: o.message,
    status: o.status,
    priority: !!o.priority,
    discount: o.discount || 0,
    comments: o.comments || [],
    files: o.files || [],
    history: o.history || [],
    rating: o.rating,
    review: o.review,
    unreadUser: !!o.unreadUser,
    unreadAdmin: !!o.unreadAdmin,
    created_at: o.created_at
  };
}

function listOrders({ userId, admin, q, status, service, from, to }) {
  let list = admin ? DB.orders.slice() : DB.orders.filter(o => o.user_id === userId);
  if (status) list = list.filter(o => o.status === status);
  if (service) list = list.filter(o => o.service === service);
  if (from) list = list.filter(o => o.created_at >= from);
  if (to) list = list.filter(o => o.created_at <= to);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter(o =>
      (o.name && o.name.toLowerCase().includes(s)) ||
      (o.email && o.email.toLowerCase().includes(s)) ||
      (o.message && o.message.toLowerCase().includes(s)) ||
      String(o.id).includes(s)
    );
  }
  return list.reverse().slice(0, 500).map(o => sanitizeOrder(o, admin));
}

function getOrder(id) {
  return DB.orders.find(o => o.id === id) || null;
}

// ========== APP ==========
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const fail = (res, code, error) => res.status(code).json({ error });

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(req, res, token, maxAge) {
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);
}
async function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}
async function checkPass(pw, stored) {
  const [alg, salt, hash] = String(stored).split(':');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  const h = Buffer.from(hash, 'hex');
  return h.length === key.length && crypto.timingSafeEqual(h, key);
}
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.t < t) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = req.ip, t = Date.now(), v = hits.get(k);
    if (!v || v.t < t) hits.set(k, { n: 1, t: t + windowMs });
    else if (++v.n > max) return fail(res, 429, 'Слишком много попыток');
    next();
  };
}

app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const o = req.headers.origin;
    if (o) {
      try { if (new URL(o).host !== req.headers.host) return fail(res, 403, 'Запрещено'); } catch { return fail(res, 403, 'Запрещено'); }
    }
  }
  next();
});
app.use('/api', (req, res, next) => {
  req.token = getCookie(req, COOKIE);
  req.user = req.token ? getSessionUser(req.token) : null;
  next();
});

const needAuth = (req, res, next) => req.user ? next() : fail(res, 401, 'Нужно войти');
const needStaff = (req, res, next) =>
  req.user && (req.user.role === 'admin' || req.user.role === 'manager' || req.user.role === 'viewer')
    ? next() : fail(res, 403, 'Только для сотрудников');
const needAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : fail(res, 403, 'Только админ');
const canWrite = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'manager');

function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  createSession(token, user.id, 30);
  setCookie(req, res, token, 30 * 86400);
}

// ----- auth -----
const authLimit = limiter(20, 15 * 60 * 1000);
app.post('/api/auth/register', authLimit, wrap(async (req, res) => {
  const name = clean(req.body.name, 60);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  const refCode = clean(req.body.ref || '', 16);
  if (name.length < 2) return fail(res, 400, 'Введите имя');
  if (!isEmail(email)) return fail(res, 400, 'Введите корректный email');
  if (password.length < 8 || password.length > 100) return fail(res, 400, 'Пароль — от 8 до 100 символов');
  let user;
  try {
    user = createUser({ name, email, pass: await hashPass(password), role: email === ADMIN_EMAIL ? 'admin' : 'user' });
  } catch (e) {
    if (e.message === 'exists') return fail(res, 409, 'Эта почта уже зарегистрирована');
    throw e;
  }
  // link guest orders
  DB.orders.forEach(o => { if (!o.user_id && o.email === email) o.user_id = user.id; });
  if (refCode) {
    const inviter = DB.users.find(u => u.referral === refCode);
    if (inviter) logAction(user.id, 'referred_by', { by: inviter.id });
  }
  saveDB();
  startSession(req, res, user);
  res.status(201).json({ user });
}));

app.post('/api/auth/login', authLimit, wrap(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  const u = getUserByEmail(email);
  if (!u || !(await checkPass(password, u.pass))) return fail(res, 401, 'Неверная почта или пароль');
  const user = pubUser(u);
  if (email === ADMIN_EMAIL && user.role !== 'admin') {
    u.role = 'admin'; saveDB(); user.role = 'admin';
  }
  startSession(req, res, user);
  res.json({ user });
}));

app.post('/api/auth/logout', (req, res) => {
  if (req.token) deleteSession(req.token);
  setCookie(req, res, '', 0);
  res.json({ ok: true });
});
app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

// profile
app.patch('/api/auth/profile', needAuth, wrap(async (req, res) => {
  const u = getUserById(req.user.id);
  if (!u) return fail(res, 404, 'Не найден');
  if (req.body.name) {
    const name = clean(req.body.name, 60);
    if (name.length < 2) return fail(res, 400, 'Имя слишком короткое');
    u.name = name;
  }
  saveDB();
  logAction(u.id, 'profile_update', {});
  res.json({ user: pubUser(u) });
}));

// password change via code (generated in cabinet)
app.post('/api/auth/reset-request', needAuth, (req, res) => {
  const u = getUserById(req.user.id);
  if (!u) return fail(res, 404, 'Не найден');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  u.resetCode = { code, exp: Date.now() + 15 * 60 * 1000 };
  saveDB();
  // code shown only in response for this demo (no email service)
  res.json({ ok: true, code, message: 'Код действует 15 минут. Введите его ниже, чтобы сменить пароль.' });
});

app.post('/api/auth/reset-confirm', needAuth, wrap(async (req, res) => {
  const u = getUserById(req.user.id);
  if (!u || !u.resetCode) return fail(res, 400, 'Сначала запросите код');
  if (u.resetCode.exp < Date.now()) return fail(res, 400, 'Код истёк');
  if (String(req.body.code) !== u.resetCode.code) return fail(res, 400, 'Неверный код');
  const password = String(req.body.password ?? '');
  if (password.length < 8 || password.length > 100) return fail(res, 400, 'Пароль — от 8 до 100 символов');
  u.pass = await hashPass(password);
  u.resetCode = null;
  saveDB();
  logAction(u.id, 'password_change', {});
  res.json({ ok: true, message: 'Пароль изменён' });
}));

// favorites
app.post('/api/auth/favorites', needAuth, (req, res) => {
  const u = getUserById(req.user.id);
  if (!u) return fail(res, 404, 'Не найден');
  const svc = clean(req.body.service, 80);
  if (!u.favorites) u.favorites = [];
  if (u.favorites.includes(svc)) u.favorites = u.favorites.filter(x => x !== svc);
  else u.favorites.push(svc);
  saveDB();
  res.json({ favorites: u.favorites });
});

// ----- promo -----
app.post('/api/promo', needAuth, limiter(10, 15 * 60 * 1000), (req, res) => {
  const code = clean(req.body.code, 40);
  const promo = DB.promos[code];
  if (!promo) return fail(res, 400, 'Промокод не найден');
  const u = getUserById(req.user.id);
  if (!u) return fail(res, 404, 'Не найден');
  if (!u.usedPromos) u.usedPromos = [];
  if (promo.once && u.usedPromos.includes(code)) return fail(res, 400, 'Промокод уже использован');
  if (promo.until && new Date(promo.until) < new Date()) return fail(res, 400, 'Промокод истёк');
  if (promo.onlyNew && DB.orders.some(o => o.user_id === u.id)) return fail(res, 400, 'Только для новых клиентов');

  if (promo.type === 'role') {
    if (u.role === 'admin') return fail(res, 400, 'У вас уже есть права администратора');
    u.role = promo.role || 'admin';
    u.usedPromos.push(code);
    saveDB();
    logAction(u.id, 'promo', { code });
    return res.json({ user: pubUser(u), message: 'Промокод активирован: ' + (promo.label || code) });
  }
  // store active promo on user for next order
  u.activePromo = { code, ...promo };
  u.usedPromos.push(code);
  saveDB();
  logAction(u.id, 'promo', { code });
  res.json({ user: pubUser(u), message: 'Промокод активирован: ' + (promo.label || code), promo: u.activePromo });
});

// ----- site content (public read, admin edit) -----
app.get('/api/content', (req, res) => res.json({ content: DB.content }));

app.put('/api/admin/content', needAuth, needAdmin, (req, res) => {
  const inc = req.body.content;
  if (!Array.isArray(inc) || inc.length !== DB.content.length) return fail(res, 400, 'Неверный формат');
  const out = [];
  for (const x of inc) {
    const n = clean(x.n, 40);
    if (n.length < 2) return fail(res, 400, 'Название слишком короткое');
    out.push({
      n, from: clean(x.from, 40), rd: clean(x.rd, 200), t: clean(x.t, 40), l: clean(x.l, 800),
      p: (Array.isArray(x.p) ? x.p : []).slice(0, 12).map(a => [clean(a && a[0], 60), clean(a && a[1], 120)]).filter(a => a[0]),
      k: (Array.isArray(x.k) ? x.k : []).slice(0, 12).map(v => clean(v, 30)).filter(Boolean)
    });
  }
  // переименование услуги в контенте = переименование в списке заявок
  out.forEach((c, i) => {
    const sv = DB.services.find(v => v.name === DB.content[i].n);
    if (sv) sv.name = c.n;
  });
  DB.content = out;
  saveDB();
  logAction(req.user.id, 'content_edit', null);
  res.json({ content: DB.content });
});

// ----- services (public list + admin CRUD) -----
app.get('/api/services', (req, res) => res.json({ services: DB.services }));

app.post('/api/admin/services', needAuth, needAdmin, (req, res) => {
  const name = clean(req.body.name, 60);
  const icon = clean(req.body.icon || 'sparkles', 30);
  const color = clean(req.body.color || '#888', 20);
  if (name.length < 2) return fail(res, 400, 'Название слишком короткое');
  const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + crypto.randomBytes(2).toString('hex');
  const s = { id, name, icon, color };
  DB.services.push(s);
  saveDB();
  logAction(req.user.id, 'service_add', { id, name });
  res.status(201).json({ service: s });
});

app.delete('/api/admin/services/:id', needAuth, needAdmin, (req, res) => {
  const id = req.params.id;
  const before = DB.services.length;
  DB.services = DB.services.filter(s => s.id !== id);
  if (DB.services.length === before) return fail(res, 404, 'Не найдено');
  saveDB();
  logAction(req.user.id, 'service_del', { id });
  res.json({ ok: true });
});

// ----- orders -----
app.post('/api/orders', limiter(15, 10 * 60 * 1000), (req, res) => {
  const services = DB.services.map(s => s.name);
  const service = services.includes(req.body.service) ? req.body.service : (req.body.service || 'Другое');
  const message = clean(req.body.message, 4000);
  if (message.length < 5) return fail(res, 400, 'Опишите задачу чуть подробнее');
  let name, email, user_id = null, priority = false, discount = 0;
  if (req.user) {
    name = req.user.name;
    email = req.user.email;
    user_id = req.user.id;
    const u = getUserById(user_id);
    if (u && u.activePromo) {
      if (u.activePromo.type === 'priority') priority = true;
      if (u.activePromo.type === 'discount') discount = u.activePromo.value || 0;
      u.activePromo = null;
      saveDB();
    }
  } else {
    name = clean(req.body.name, 60);
    email = clean(req.body.email, 120).toLowerCase();
    if (name.length < 2) return fail(res, 400, 'Введите имя');
    if (!isEmail(email)) return fail(res, 400, 'Введите корректный email');
  }
  const order = createOrder({ user_id, name, email, service, message, priority, discount });
  res.status(201).json({ order });
});

app.get('/api/orders', needAuth, (req, res) => {
  res.json({
    orders: listOrders({
      userId: req.user.id,
      admin: false,
      q: req.query.q,
      status: req.query.status,
      service: req.query.service,
      from: req.query.from,
      to: req.query.to
    })
  });
});

app.get('/api/admin/orders', needAuth, needStaff, (req, res) => {
  res.json({
    orders: listOrders({
      admin: true,
      q: req.query.q,
      status: req.query.status,
      service: req.query.service,
      from: req.query.from,
      to: req.query.to
    })
  });
});

app.get('/api/orders/:id', needAuth, (req, res) => {
  const o = getOrder(+req.params.id);
  if (!o) return fail(res, 404, 'Не найдено');
  const staff = req.user.role === 'admin' || req.user.role === 'manager' || req.user.role === 'viewer';
  if (!staff && o.user_id !== req.user.id) return fail(res, 403, 'Нет доступа');
  if (staff) { o.unreadAdmin = false; saveDB(); }
  else { o.unreadUser = false; saveDB(); }
  res.json({ order: sanitizeOrder(o, staff) });
});

app.patch('/api/admin/orders/:id', needAuth, needStaff, (req, res) => {
  if (!canWrite(req)) return fail(res, 403, 'Только просмотр');
  const o = getOrder(+req.params.id);
  if (!o) return fail(res, 404, 'Не найдено');
  const status = req.body.status;
  if (!STATUSES.includes(status)) return fail(res, 400, 'Неверный статус');
  o.status = status;
  o.history = o.history || [];
  o.history.push({ at: new Date().toISOString(), status, by: req.user.id, byName: req.user.name });
  o.unreadUser = true;
  saveDB();
  logAction(req.user.id, 'status', { orderId: o.id, status });
  res.json({ order: sanitizeOrder(o, true) });
});

// comments
app.post('/api/orders/:id/comments', needAuth, (req, res) => {
  const o = getOrder(+req.params.id);
  if (!o) return fail(res, 404, 'Не найдено');
  const staff = canWrite(req) || req.user.role === 'viewer';
  const isOwner = o.user_id === req.user.id;
  if (!staff && !isOwner) return fail(res, 403, 'Нет доступа');
  if (req.user.role === 'viewer') return fail(res, 403, 'Только просмотр');
  const text = clean(req.body.text, 2000);
  if (text.length < 1) return fail(res, 400, 'Пустой комментарий');
  const c = {
    id: ++DB.seq.comments,
    text,
    by: req.user.id,
    byName: req.user.name,
    role: req.user.role,
    at: new Date().toISOString()
  };
  o.comments = o.comments || [];
  o.comments.push(c);
  if (staff) o.unreadUser = true;
  else o.unreadAdmin = true;
  saveDB();
  res.status(201).json({ comment: c });
});

// rating
app.post('/api/orders/:id/rate', needAuth, (req, res) => {
  const o = getOrder(+req.params.id);
  if (!o) return fail(res, 404, 'Не найдено');
  if (o.user_id !== req.user.id) return fail(res, 403, 'Нет доступа');
  if (o.status !== 'done') return fail(res, 400, 'Оценить можно только выполненную заявку');
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) return fail(res, 400, 'Оценка от 1 до 5');
  o.rating = rating;
  o.review = clean(req.body.review || '', 1000);
  saveDB();
  res.json({ order: sanitizeOrder(o, false) });
});

// file upload (base64 simple, no multer)
app.post('/api/orders/:id/files', needAuth, (req, res) => {
  const o = getOrder(+req.params.id);
  if (!o) return fail(res, 404, 'Не найдено');
  const staff = canWrite(req);
  const isOwner = o.user_id === req.user.id;
  if (!staff && !isOwner) return fail(res, 403, 'Нет доступа');
  if (req.user.role === 'viewer') return fail(res, 403, 'Только просмотр');
  const { name, data, type } = req.body || {};
  if (!name || !data) return fail(res, 400, 'Нет файла');
  const buf = Buffer.from(String(data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length > MAX_FILE) return fail(res, 400, 'Файл больше 5 МБ');
  const safe = String(name).replace(/[^a-zA-Z0-9._\-а-яА-ЯёЁ]/g, '_').slice(0, 80);
  const fname = o.id + '_' + (++DB.seq.files) + '_' + safe;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
  const f = { id: DB.seq.files, name: safe, url: '/uploads/' + fname, type: type || 'application/octet-stream', at: new Date().toISOString(), by: req.user.id };
  o.files = o.files || [];
  o.files.push(f);
  if (staff) o.unreadUser = true; else o.unreadAdmin = true;
  saveDB();
  res.status(201).json({ file: f });
});

// notifications count
app.get('/api/notifications', needAuth, (req, res) => {
  const staff = req.user.role === 'admin' || req.user.role === 'manager' || req.user.role === 'viewer';
  let count = 0;
  if (staff) count = DB.orders.filter(o => o.unreadAdmin).length;
  else count = DB.orders.filter(o => o.user_id === req.user.id && o.unreadUser).length;
  res.json({ count });
});

// dashboard
app.get('/api/admin/dashboard', needAuth, needStaff, (req, res) => {
  const orders = DB.orders;
  const byStatus = {};
  STATUSES.forEach(s => { byStatus[s] = 0; });
  orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  const byService = {};
  orders.forEach(o => { byService[o.service] = (byService[o.service] || 0) + 1; });
  // last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = orders.filter(o => (o.created_at || '').slice(0, 10) === key).length;
    days.push({ date: key, count });
  }
  const done = byStatus.done || 0;
  const total = orders.length || 1;
  res.json({
    total: orders.length,
    byStatus,
    byService,
    days,
    conversion: Math.round((done / total) * 100),
    avgRating: (() => {
      const rated = orders.filter(o => o.rating);
      if (!rated.length) return null;
      return Math.round((rated.reduce((a, o) => a + o.rating, 0) / rated.length) * 10) / 10;
    })()
  });
});

// quick replies
app.get('/api/admin/quick-replies', needAuth, needStaff, (req, res) => {
  res.json({ replies: QUICK_REPLIES });
});

// export CSV
app.get('/api/admin/export', needAuth, needStaff, (req, res) => {
  const rows = [['id','name','email','service','status','priority','discount','rating','created_at','message']];
  DB.orders.forEach(o => {
    rows.push([
      o.id, o.name, o.email, o.service, o.status,
      o.priority ? 1 : 0, o.discount || 0, o.rating || '',
      o.created_at, (o.message || '').replace(/\n/g, ' ')
    ].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send('\uFEFF' + rows.join('\n'));
});

// admin logs
app.get('/api/admin/logs', needAuth, needAdmin, (req, res) => {
  res.json({ logs: DB.logs.slice(0, 100) });
});

// set role (admin only)
app.patch('/api/admin/users/:id/role', needAuth, needAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return fail(res, 404, 'Не найден');
  const role = req.body.role;
  if (!ROLES.includes(role)) return fail(res, 400, 'Неверная роль');
  u.role = role;
  saveDB();
  logAction(req.user.id, 'set_role', { target: u.id, role });
  res.json({ user: pubUser(u) });
});

app.get('/api/admin/users', needAuth, needAdmin, (req, res) => {
  res.json({ users: DB.users.map(pubUser) });
});

// promo admin
app.get('/api/admin/promos', needAuth, needAdmin, (req, res) => res.json({ promos: DB.promos }));
app.post('/api/admin/promos', needAuth, needAdmin, (req, res) => {
  const code = clean(req.body.code, 40);
  if (!code) return fail(res, 400, 'Нужен код');
  DB.promos[code] = {
    type: req.body.type || 'discount',
    value: req.body.value || 0,
    role: req.body.role,
    label: clean(req.body.label || code, 80),
    once: req.body.once !== false,
    until: req.body.until || null,
    onlyNew: !!req.body.onlyNew
  };
  saveDB();
  res.json({ promos: DB.promos });
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: DB_FILE }));

app.use('/api', (req, res) => fail(res, 404, 'Не найдено'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
// SPA-like pages
app.get(['/cabinet', '/order', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Неверный формат');
  fail(res, 500, 'Ошибка сервера');
});

loadDB();
app.listen(PORT, '0.0.0.0', () => {
  console.log('KEEP на порту', PORT);
  console.log('БД:', DB_FILE);
});
