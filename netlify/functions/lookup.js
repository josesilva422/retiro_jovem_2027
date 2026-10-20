const { json, parseBody, sb, loadPricing } = require('./_shared');
const ip = require('./_infinitepay');

const short = n => { const w = n.trim().split(/\s+/); return w.length > 1 ? w[0] + ' ' + w[w.length - 1][0] + '.' : w[0]; };
const mask = c => (c ? '•••.•••.•••-' + c.slice(-2) : 'sem CPF');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Consulta pública por protocolo ou CPF: devolve nomes abreviados e CPF mascarado.
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const b = parseBody(event);
    const q = String(b.q || '').replace(/[<>]/g, '').trim().slice(0, 40), digits = q.replace(/\D/g, '');
    await sleep(300); // freia tentativas em massa
    let rows = [], cpf = null;
    if (/^RC-[0-9A-F]{6}$/i.test(q)) {
      const r = await sb(`registrations?select=*&protocol=eq.${q.toUpperCase()}`);
      if (!r.ok) throw new Error('db'); rows = r.data;
    } else if (digits.length === 11) {
      cpf = digits;
      const r = await sb(`registrations?select=*&cpfs=cs.{${cpf}}&order=created_at.desc`);
      if (!r.ok) throw new Error('db'); rows = r.data;
    }
    const reg = rows.find(r => r.status !== 'cancelada') || rows[0];
    if (!reg) return json(404, { found: false, error: 'Nenhuma inscrição encontrada. Confira o protocolo ou o CPF.' });
    return json(200, {
      found: true, protocol: reg.protocol, status: reg.status, createdAt: reg.created_at,
      payable: ip.enabled() && reg.payment.method === 'cartao' && !reg.payment.paid && reg.status === 'pre-cadastro',
      total: reg.payment.total, method: reg.payment.method, installments: reg.payment.installments, plan: loadPricing().planInfo(reg.payment),
      participants: reg.participants.map(p => ({ name: short(p.name), lodging: p.lodging, district: p.district, cpf: mask(p.cpf), matched: cpf ? p.cpf === cpf : false }))
    });
  } catch (e) {
    if (e.message === 'bad-json') return json(400, { error: 'JSON inválido.' });
    console.error('lookup:', e.message);
    return json(500, { error: 'Não foi possível consultar agora. Tente novamente.' });
  }
};
