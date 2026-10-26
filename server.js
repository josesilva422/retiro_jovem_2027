// Servidor sem dependências externas: serve o site, recebe inscrições e alimenta o painel admin.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Pricing = require('./public/js/pricing.js');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const REG_FILE = path.join(DATA, 'registrations.json');
const WAIT_FILE = path.join(DATA, 'waitlist.json');

fs.mkdirSync(DATA, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2'
};

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (process.env.REGISTRATION_OPEN) cfg.registrationOpen = process.env.REGISTRATION_OPEN === 'true';
  return cfg;
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', ...headers
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 200_000) { reject(new Error('too-large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('bad-json')); } });
    req.on('error', reject);
  });
}

// Limitador simples por IP (30 requisições de escrita / 10 min)
const hits = new Map();
function limited(ip) {
  const now = Date.now(); const arr = (hits.get(ip) || []).filter(t => now - t < 600_000);
  arr.push(now); hits.set(ip, arr); return arr.length > 30;
}

function validCpf(raw) {
  const c = String(raw).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== +c[t]) return false;
  }
  return true;
}
const clean = (v, max = 120) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

function validatePerson(p, cfg) {
  const out = {
    name: clean(p.name), age: parseInt(p.age, 10), cpf: String(p.cpf || '').replace(/\D/g, ''),
    phone: Pricing.phoneDigits(p.phone), district: clean(p.district, 80), lodging: p.lodging
  };
  if (out.name.split(/\s+/).length < 2) return { error: 'Informe o nome completo.' };
  if (!(out.age >= 0 && out.age <= 99)) return { error: `Idade inválida para ${out.name}.` };
  const noCpf = p.nocpf === true || p.noCpf === true;
  if (noCpf) { if (out.age >= 18) return { error: `${out.name}: maiores de 18 anos precisam informar o CPF.` }; out.cpf = ''; }
  else if (!validCpf(out.cpf)) return { error: `CPF inválido para ${out.name}.` };
  if (out.phone.length < 10 || out.phone.length > 11) return { error: `Telefone inválido para ${out.name}.` };
  if (!out.district) return { error: `Informe quem convidou ${out.name}.` };
  if (cfg.districts?.length && !cfg.districts.includes(out.district)) return { error: `Opção inválida em "Convidado por" para ${out.name}.` };
  if (!['camping', 'dormitorio'].includes(out.lodging)) return { error: `Escolha camping ou dormitório para ${out.name}.` };
  return { value: out };
}

// O que a consulta pública revela: nomes abreviados e CPF mascarado
function publicView(reg, cpf) {
  const short = n => { const w = n.trim().split(/\s+/); return w.length > 1 ? w[0] + ' ' + w[w.length - 1][0] + '.' : w[0]; };
  const mask = c => (c ? '•••.•••.•••-' + c.slice(-2) : 'sem CPF');
  return {
    found: true, protocol: reg.protocol, status: reg.status, createdAt: reg.createdAt,
    base: reg.payment.subtotal, total: reg.payment.total, method: reg.payment.method, installments: reg.payment.installments, plan: Pricing.planInfo(reg.payment),
    participants: reg.participants.map(p => ({ name: short(p.name), lodging: p.lodging, district: p.district, cpf: mask(p.cpf), matched: cpf ? p.cpf === cpf : false }))
  };
}

// Colunas extras do CSV: saúde por participante; emergência, autorização e imagem só na linha do responsável
function infoCols(r, p, first) {
  const i = r.info || {}, h = p.health || (first && i.health) || null;
  const t = k => (h && h[k] && h[k].has ? h[k].text : '');
  const em = first && i.emergency ? i.emergency.name + (i.emergency.relation ? ' (' + i.emergency.relation + ')' : '') : '';
  return [em, first && i.emergency ? i.emergency.phone : '', t('allergy'), t('diet'), t('medication'), t('accessibility'),
    first && i.minors && i.minors.authorizationRequired ? 'SIM - entregar no dia' : '', first && r.info ? (i.imageConsent ? 'Autoriza' : 'Não autoriza') : ''];
}

async function handleApi(req, res, url) {
  const cfg = loadConfig();
  const ip = req.socket.remoteAddress;

  const takenSpots = () => readJson(REG_FILE).filter(r => r.status === 'confirmada').reduce((s, r) => s + r.participants.length, 0);
  if (req.method === 'GET' && url.pathname === '/api/vagas') {
    const cap = cfg.capacity || {}, total = cap.total || 0, taken = takenSpots();
    return send(res, 200, { total, taken, remaining: total ? Math.max(total - taken, 0) : null, warnAt: cap.warnAt || 20 });
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const { pix, ...pub } = cfg;
    return send(res, 200, { ...pub, pixKey: cfg.pix.key, pixHolder: cfg.pix.holder });
  }

  if (req.method === 'POST' && url.pathname === '/api/waitlist') {
    if (limited(ip)) return send(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    const b = await readBody(req);
    const name = clean(b.name), phone = String(b.phone || '').replace(/\D/g, '');
    if (!name || phone.length < 10) return send(res, 400, { error: 'Informe nome e telefone válidos.' });
    const list = readJson(WAIT_FILE);
    if (!list.some(x => x.phone === phone)) list.push({ name, phone, createdAt: new Date().toISOString() });
    writeJson(WAIT_FILE, list);
    return send(res, 201, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    if (limited(ip)) return send(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    if (!cfg.registrationOpen) return send(res, 403, { error: 'As inscrições ainda não foram abertas.' });
    const b = await readBody(req);
    if (!Array.isArray(b.participants) || b.participants.length < 1 || b.participants.length > 15)
      return send(res, 400, { error: 'Informe de 1 a 15 participantes.' });

    const participants = [];
    for (const p of b.participants) {
      const r = validatePerson(p, cfg);
      if (r.error) return send(res, 400, { error: r.error });
      participants.push(r.value);
    }
    if (!participants.some(p => p.cpf)) return send(res, 400, { error: 'Pelo menos um participante (o responsável) precisa informar o CPF.' });
    const cpfs = participants.map(p => p.cpf).filter(Boolean);
    if (new Set(cpfs).size !== cpfs.length) return send(res, 400, { error: 'Há CPFs repetidos na inscrição.' });

    const capTotal = (cfg.capacity && cfg.capacity.total) || 0;
    if (capTotal) {
      const left = capTotal - takenSpots();
      if (left <= 0) return send(res, 409, { error: 'As vagas do retiro esgotaram. Fale com o responsável do seu distrito.' });
      if (participants.length > left) return send(res, 409, { error: 'Restam apenas ' + left + ' vaga' + (left > 1 ? 's' : '') + '. Reduza o número de participantes ou fale com o responsável do seu distrito.' });
    }
    const regs = readJson(REG_FILE);
    const taken = new Set(regs.filter(r => r.status !== 'cancelada').flatMap(r => r.participants.map(p => p.cpf)));
    const dup = participants.find(p => p.cpf && taken.has(p.cpf));
    if (dup) return send(res, 409, { error: `${dup.name} já possui pré-cadastro com esse CPF.` });

    const hh = Pricing.checkHealth(b.participants, participants);
    if (hh.error) return send(res, 400, { error: hh.error });
    participants.forEach((x, i) => { x.health = hh.value[i]; });
    const inf = Pricing.checkInfo(b.info, participants);
    if (inf.error) return send(res, 400, { error: inf.error });
    const q = Pricing.quote(participants, b.payment, cfg);
    if (q.error) return send(res, 400, { error: q.error });
    const { calc } = q;

    const reg = {
      id: crypto.randomUUID(),
      protocol: 'RC-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      status: 'pre-cadastro',
      createdAt: new Date().toISOString(),
      participants,
      info: inf.value,
      payment: { method: calc.method, installments: calc.installments, feePercent: calc.fee, subtotal: calc.subtotal, discount: calc.discount, combo: calc.comboOk, total: calc.total, paid: false }
    };
    const pl = Pricing.plan(calc, reg.createdAt);
    if (pl) reg.payment.plan = pl;
    regs.push(reg);
    writeJson(REG_FILE, regs);
    return send(res, 201, { ok: true, protocol: reg.protocol, subtotal: calc.subtotal, total: calc.total, installments: calc.installments, method: calc.method, combo: calc.comboOk, plan: reg.payment.plan || null, authorization: inf.value.minors.authorizationRequired, status: reg.status });
  }

  // ---------- Consulta pública (por protocolo ou CPF) ----------
  if (req.method === 'POST' && url.pathname === '/api/lookup') {
    if (limited(ip)) return send(res, 429, { error: 'Muitas consultas. Tente novamente em alguns minutos.' });
    const b = await readBody(req);
    const q = clean(b.q, 40), digits = q.replace(/\D/g, '');
    const regs = readJson(REG_FILE);
    let reg = null, cpf = null;
    if (/^RC-[0-9A-F]{6}$/i.test(q)) reg = regs.find(r => r.protocol === q.toUpperCase());
    else if (digits.length === 11) {
      cpf = digits;
      const mine = regs.filter(r => r.participants.some(p => p.cpf === cpf));
      reg = mine.find(r => r.status !== 'cancelada') || mine[0];
    }
    if (!reg) return send(res, 404, { found: false, error: 'Nenhuma inscrição encontrada. Confira o protocolo ou o CPF.' });
    return send(res, 200, publicView(reg, cpf));
  }

  // ---------- Admin ----------
  if (url.pathname.startsWith('/api/admin/')) {
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {   // local: e-mail livre + ADMIN_PASSWORD
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase(), pass = String(b.password || '').trim();
      if (!email || !pass) return send(res, 400, { error: 'Informe o e-mail e a senha.' });
      const a = Buffer.from(pass), z = Buffer.from(String(ADMIN_PASSWORD).trim());
      if (a.length !== z.length || !crypto.timingSafeEqual(a, z)) return send(res, 401, { error: 'E-mail ou senha incorretos.' });
      return send(res, 200, { mode: 'legacy', email });
    }
    let raw = String(req.headers['x-admin-password'] || '');
    try { raw = decodeURIComponent(raw); } catch { /* usa como veio */ }
    const given = Buffer.from(raw.trim());
    const real = Buffer.from(String(ADMIN_PASSWORD).trim());
    if (given.length !== real.length || !crypto.timingSafeEqual(given, real))
      return send(res, 401, { error: 'Senha incorreta.' });

    if (req.method === 'GET' && url.pathname === '/api/admin/data')
      return send(res, 200, { registrations: readJson(REG_FILE), waitlist: readJson(WAIT_FILE), registrationOpen: cfg.registrationOpen });

    if (req.method === 'POST' && url.pathname === '/api/admin/status') {
      const b = await readBody(req);
      if (!['pre-cadastro', 'confirmada', 'cancelada'].includes(b.status)) return send(res, 400, { error: 'Status inválido.' });
      const regs = readJson(REG_FILE);
      const r = regs.find(x => x.id === b.id);
      if (!r) return send(res, 404, { error: 'Inscrição não encontrada.' });
      if (r.payment.plan) {
        if (b.status === 'confirmada') return send(res, 400, { error: 'Este pagamento é parcelado: marque as parcelas como pagas.' });
        r.status = b.status; Pricing.syncPlan(r);
      } else { r.status = b.status; r.payment.paid = b.status === 'confirmada'; }
      Pricing.logEvent(r.payment, 'painel local', b.status);
      writeJson(REG_FILE, regs);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/payment-method') {
      const b = await readBody(req);
      const regs = readJson(REG_FILE), r = regs.find(x => x.id === b.id);
      if (!r) return send(res, 404, { error: 'Inscrição não encontrada.' });
      if (r.status === 'cancelada') return send(res, 409, { error: 'Esta inscrição está cancelada.' });
      if (r.payment.paid || (r.payment.plan && r.payment.plan.some(x => x.paid))) return send(res, 409, { error: 'Já existe pagamento registrado nesta inscrição. Desfaça os pagamentos antes de trocar a forma.' });
      const q = Pricing.quote(r.participants, { method: b.method, installments: b.installments, combo: !!r.payment.combo }, cfg);
      if (q.error) return send(res, 400, { error: q.error });
      const c = q.calc, label = p => p.method === 'pix' ? 'Pix' : p.method === 'crediario' ? 'Crediário ' + p.installments + 'x' : 'Cartão ' + p.installments + 'x';
      const old = r.payment, payment = { ...old, method: c.method, installments: c.installments, feePercent: c.fee, subtotal: c.subtotal, discount: c.discount, combo: c.comboOk, total: c.total, paid: false };
      delete payment.plan; delete payment.checkoutUrl;
      const pl = Pricing.plan(c, new Date().toISOString()); if (pl) payment.plan = pl;
      Pricing.logEvent(payment, 'painel local', 'forma-alterada', label(old) + ' → ' + label(payment));
      r.payment = payment; writeJson(REG_FILE, regs);
      return send(res, 200, { ok: true });
    }

    // Marcar / desmarcar uma parcela do crediário
    if (req.method === 'POST' && url.pathname === '/api/admin/installment') {
      const b = await readBody(req);
      const regs = readJson(REG_FILE);
      const r = regs.find(x => x.id === b.id);
      const it = r && r.payment.plan && r.payment.plan[parseInt(b.n, 10) - 1];
      if (!it) return send(res, 404, { error: 'Parcela não encontrada.' });
      const before = r.status;
      it.paid = !!b.paid; it.paidAt = it.paid ? new Date().toISOString() : null;
      Pricing.syncPlan(r);
      Pricing.logEvent(r.payment, 'painel local', it.paid ? 'parcela-paga' : 'parcela-desfeita', 'Parcela ' + it.n);
      if (r.status !== before) Pricing.logEvent(r.payment, 'painel local', r.status);
      writeJson(REG_FILE, regs);
      return send(res, 200, { ok: true, status: r.status });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Protocolo', 'Status', 'Data', 'Nome', 'Idade', 'CPF', 'Telefone', 'Convidado por', 'Acomodação', 'Pagamento', 'Parcelas', 'Parcelas pagas', 'Total da inscrição', 'Valor líquido (organização)', 'Contato de emergência', 'Telefone de emergência', 'Alergia', 'Restrição alimentar', 'Medicamento controlado', 'Acessibilidade', 'Autorização de menores', 'Uso de imagem']];
      for (const r of readJson(REG_FILE)) for (const p of r.participants)
        rows.push([r.protocol, r.status, r.createdAt, p.name, p.age, p.cpf, p.phone, p.district, p.lodging, r.payment.method, r.payment.installments, r.payment.plan ? r.payment.plan.filter(x => x.paid).length + '/' + r.payment.plan.length : '', r.payment.total, r.payment.method === 'cartao' ? r.payment.subtotal : r.payment.total, ...infoCols(r, p, p === r.participants[0])]);
      return send(res, 200, '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'),
        { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="inscricoes.csv"' });
    }
  }
  return send(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/admin') p = '/admin.html';
  if (p === '/consulta') p = '/consulta.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Proibido');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Página não encontrada');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'
    });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    const msg = e.message === 'bad-json' ? 'JSON inválido.' : e.message === 'too-large' ? 'Requisição grande demais.' : 'Erro interno.';
    if (!res.headersSent) send(res, e.message === 'bad-json' || e.message === 'too-large' ? 400 : 500, { error: msg });
    if (msg === 'Erro interno.') console.error(e);
  }
}).listen(PORT, () => {
  console.log(`RECONNECT no ar: http://localhost:${PORT}  |  Admin: http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === 'troque-esta-senha') console.log('⚠ Defina ADMIN_PASSWORD antes de publicar.');
});
