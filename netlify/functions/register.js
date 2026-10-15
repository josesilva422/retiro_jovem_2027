const crypto = require('crypto');
const { loadConfig, loadPricing, json, parseBody, sb, validatePerson } = require('./_shared');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const cfg = loadConfig();
    if (!cfg.registrationOpen) return json(403, { error: 'As inscrições ainda não foram abertas.' });

    const b = parseBody(event);
    if (!Array.isArray(b.participants) || b.participants.length < 1 || b.participants.length > 15)
      return json(400, { error: 'Informe de 1 a 15 participantes.' });

    const participants = [];
    for (const p of b.participants) {
      const r = validatePerson(p, cfg);
      if (r.error) return json(400, { error: r.error });
      participants.push(r.value);
    }
    if (!participants.some(p => p.cpf)) return json(400, { error: 'Pelo menos um participante (o responsável) precisa informar o CPF.' });
    const cpfs = participants.map(p => p.cpf).filter(Boolean);
    if (new Set(cpfs).size !== cpfs.length) return json(400, { error: 'Há CPFs repetidos na inscrição.' });

    const hh = loadPricing().checkHealth(b.participants, participants);
    if (hh.error) return json(400, { error: hh.error });
    participants.forEach((x, i) => { x.health = hh.value[i]; });
    const inf = loadPricing().checkInfo(b.info, participants);
    if (inf.error) return json(400, { error: inf.error });
    const q = loadPricing().quote(participants, b.payment, cfg);
    if (q.error) return json(400, { error: q.error });
    const { calc } = q;

    // CPF já inscrito (ignora inscrições canceladas)
    const dup = await sb(`registrations?select=participants&status=neq.cancelada&cpfs=ov.{${cpfs.join(',')}}`);
    if (!dup.ok) throw new Error('db');
    if (dup.data.length) {
      const taken = new Set(dup.data.flatMap(r => r.participants.map(p => p.cpf)));
      const who = participants.find(p => p.cpf && taken.has(p.cpf));
      return json(409, { error: `${who.name} já possui pré-cadastro com esse CPF.` });
    }

    const payment = { method: calc.method, installments: calc.installments, feePercent: calc.fee, subtotal: calc.subtotal, discount: calc.discount, combo: calc.comboOk, total: calc.total, paid: false };
    const pl = loadPricing().plan(calc, new Date().toISOString());
    if (pl) payment.plan = pl;

    let protocol;
    for (let tries = 0; tries < 3; tries++) {
      protocol = 'RC-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const ins = await sb('registrations', { method: 'POST', prefer: 'return=minimal', body: { protocol, status: 'pre-cadastro', participants, cpfs, payment, info: inf.value } });
      if (ins.ok) return json(201, { ok: true, protocol, total: calc.total, installments: calc.installments, method: calc.method, combo: calc.comboOk, plan: payment.plan || null, authorization: inf.value.minors.authorizationRequired, status: 'pre-cadastro' });
      if (ins.status !== 409) throw new Error('db');
    }
    throw new Error('db');
  } catch (e) {
    if (e.message === 'bad-json') return json(400, { error: 'JSON inválido.' });
    if (e.message === 'too-large') return json(413, { error: 'Requisição grande demais.' });
    console.error('register:', e.message);
    return json(500, { error: 'Não foi possível salvar agora. Tente novamente em instantes.' });
  }
};
