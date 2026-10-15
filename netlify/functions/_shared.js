// Código compartilhado pelas funções do Netlify. Sem dependências externas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadConfig() {
  const candidates = [
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'config.json'),
    path.join(__dirname, '..', '..', 'config.json'),
    path.join(process.cwd(), 'config.json')
  ];
  for (const f of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (process.env.REGISTRATION_OPEN) cfg.registrationOpen = process.env.REGISTRATION_OPEN === 'true';
      return cfg;
    } catch { /* tenta o próximo */ }
  }
  throw new Error('config.json não encontrado');
}

function loadPricing() {
  const candidates = [
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'public', 'js', 'pricing.js'),
    path.join(__dirname, '..', '..', 'public', 'js', 'pricing.js'),
    path.join(process.cwd(), 'public', 'js', 'pricing.js')
  ];
  for (const f of candidates) { try { return require(f); } catch { /* tenta o próximo */ } }
  throw new Error('pricing.js não encontrado');
}

const json = (status, body, headers = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  body: JSON.stringify(body)
});

function parseBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
  if (raw.length > 200_000) { const e = new Error('too-large'); throw e; }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('bad-json'); }
}

// Acesso ao Supabase via REST com a chave de serviço (nunca vai para o navegador).
async function sb(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-not-configured');
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');   // aceita a URL com ou sem /rest/v1
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key, 'Content-Type': 'application/json',
      // Chaves antigas (service_role) são JWT e vão também em Authorization; as novas (sb_secret_...) só em apikey.
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
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
    phone: String(p.phone || '').replace(/\D/g, ''), district: clean(p.district, 80), lodging: p.lodging
  };
  if (out.name.split(/\s+/).length < 2) return { error: 'Informe o nome completo.' };
  if (!(out.age >= 0 && out.age <= 99)) return { error: `Idade inválida para ${out.name}.` };
  const noCpf = p.nocpf === true || p.noCpf === true;
  if (noCpf) { if (out.age >= 18) return { error: `${out.name}: maiores de 18 anos precisam informar o CPF.` }; out.cpf = ''; }
  else if (!validCpf(out.cpf)) return { error: `CPF inválido para ${out.name}.` };
  if (out.phone.length < 10 || out.phone.length > 11) return { error: `Telefone inválido para ${out.name}.` };
  if (!out.district) return { error: `Informe quem convidou ${out.name}.` };
  if (cfg?.districts?.length && !cfg.districts.includes(out.district)) return { error: `Opção inválida em "Convidado por" para ${out.name}.` };
  if (!['camping', 'dormitorio'].includes(out.lodging)) return { error: `Escolha camping ou dormitório para ${out.name}.` };
  return { value: out };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkAdmin(event) {
  // Tolerante: ignora espaço/quebra de linha sobrando na variável do Netlify e aceita a senha codificada no cabeçalho.
  const real = String(process.env.ADMIN_PASSWORD || '').trim();
  if (!real) return { status: 503, error: 'ADMIN_PASSWORD não configurada no Netlify.' };
  let raw = String(event.headers['x-admin-password'] || '');
  try { raw = decodeURIComponent(raw); } catch { /* usa como veio */ }
  const given = Buffer.from(raw.trim());
  const want = Buffer.from(real);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return null;
  await sleep(600); // dificulta tentativa e erro
  return { status: 401, error: 'Senha incorreta.' };
}

module.exports = { loadConfig, loadPricing, json, parseBody, sb, validatePerson, checkAdmin };
