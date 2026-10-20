// Integração com o Checkout da InfinitePay (cartão e Pix em página hospedada por eles).
// Só fica ativa quando a variável INFINITEPAY_HANDLE (InfiniteTag, sem $) existe no Netlify.
const { sb } = require('./_shared');

const API = 'https://api.checkout.infinitepay.io';
const handle = () => String(process.env.INFINITEPAY_HANDLE || '').trim().replace(/^\$/, '');
const enabled = () => !!handle();
const siteUrl = () => String(process.env.URL || process.env.SITE_URL || '').trim().replace(/\/+$/, '');
const cents = n => Math.round(Number(n) * 100);

async function post(path, body) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// A resposta do POST /links não é detalhada na documentação: procura o primeiro endereço https dentro dela.
function findUrl(o, depth = 0) {
  if (!o || depth > 3) return null;
  if (typeof o === 'string') return /^https:\/\//i.test(o) ? o : null;
  if (typeof o !== 'object') return null;
  for (const k of ['url', 'checkout_url', 'link', 'payment_url']) if (typeof o[k] === 'string' && /^https:\/\//i.test(o[k])) return o[k];
  for (const k of Object.keys(o)) { const u = findUrl(o[k], depth + 1); if (u) return u; }
  return null;
}

// Cria o link de pagamento. O valor enviado é o preço-base da inscrição (sem taxa);
// a taxa do parcelamento é somada pela própria InfinitePay conforme as parcelas escolhidas no checkout.
async function createLink(reg) {
  const p = reg.payment, n = reg.participants.length, site = siteUrl();
  const body = {
    handle: handle(),
    order_nsu: reg.protocol,
    items: [{ quantity: 1, price: cents(p.subtotal), description: `RECONNECT 2027 - ${n} vaga${n > 1 ? 's' : ''} - ${reg.protocol}` }],
    customer: { name: reg.participants[0].name }
  };
  if (site) { body.redirect_url = `${site}/consulta?protocolo=${reg.protocol}`; body.webhook_url = `${site}/api/infinitepay-webhook`; }
  const r = await post('/links', body);
  const url = r.ok ? findUrl(r.data) : null;
  if (!url) { console.error('infinitepay createLink:', r.status, JSON.stringify(r.data).slice(0, 300)); throw new Error('ip-link'); }
  return url;
}

// Devolve o link já criado ou cria um novo (e guarda na inscrição).
async function ensureLink(protocol) {
  const g = await sb(`registrations?select=id,protocol,status,participants,payment&protocol=eq.${encodeURIComponent(protocol)}`);
  if (!g.ok || !g.data.length) return { error: 'Inscrição não encontrada.', status: 404 };
  const reg = g.data[0], p = reg.payment;
  if (reg.status === 'cancelada') return { error: 'Esta inscrição foi cancelada.', status: 409 };
  if (p.method !== 'cartao') return { error: 'Esta inscrição não é de pagamento no cartão.', status: 409 };
  if (p.paid) return { error: 'Esta inscrição já está paga.', status: 409 };
  if (p.checkoutUrl) return { url: p.checkoutUrl };
  const url = await createLink(reg);
  await sb(`registrations?id=eq.${reg.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { payment: { ...p, checkoutUrl: url } } });
  return { url };
}

const check = body => post('/payment_check', { handle: handle(), ...body });

module.exports = { enabled, ensureLink, createLink, check, cents, findUrl };
