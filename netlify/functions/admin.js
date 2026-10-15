const { loadConfig, loadPricing, json, parseBody, sb, checkAdmin } = require('./_shared');

const toApi = r => ({ id: r.id, protocol: r.protocol, status: r.status, createdAt: r.created_at, participants: r.participants, payment: r.payment, info: r.info || null });

// Colunas extras do CSV: saúde por participante; emergência, autorização e imagem só na linha do responsável
function infoCols(r, p, first) {
  const i = r.info || {}, h = p.health || (first && i.health) || null;
  const t = k => (h && h[k] && h[k].has ? h[k].text : '');
  const em = first && i.emergency ? i.emergency.name + (i.emergency.relation ? ' (' + i.emergency.relation + ')' : '') : '';
  return [em, first && i.emergency ? i.emergency.phone : '', t('allergy'), t('diet'), t('medication'), t('accessibility'),
    first && i.minors && i.minors.authorizationRequired ? 'SIM - entregar no dia' : '', first && r.info ? (i.imageConsent ? 'Autoriza' : 'Não autoriza') : ''];
}

exports.handler = async event => {
  const denied = await checkAdmin(event);
  if (denied) return json(denied.status, { error: denied.error });

  const action = event.path.split('/').filter(Boolean).pop();
  try {
    if (event.httpMethod === 'GET' && action === 'data') {
      const r = await sb('registrations?select=*&order=created_at.asc');
      if (!r.ok) throw new Error('db');
      return json(200, { registrations: r.data.map(toApi), waitlist: [], registrationOpen: loadConfig().registrationOpen });
    }

    if (event.httpMethod === 'POST' && action === 'status') {
      const b = parseBody(event);
      if (!['pre-cadastro', 'confirmada', 'cancelada'].includes(b.status)) return json(400, { error: 'Status inválido.' });
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id))) return json(400, { error: 'ID inválido.' });
      const cur = await sb(`registrations?select=status,payment&id=eq.${b.id}`);
      if (!cur.ok || !cur.data.length) return json(404, { error: 'Inscrição não encontrada.' });
      const reg = { status: cur.data[0].status, payment: cur.data[0].payment };
      if (reg.payment.plan) {
        if (b.status === 'confirmada') return json(400, { error: 'Este pagamento é parcelado: marque as parcelas como pagas.' });
        reg.status = b.status; loadPricing().syncPlan(reg);
      } else { reg.status = b.status; reg.payment = { ...reg.payment, paid: b.status === 'confirmada' }; }
      const up = await sb(`registrations?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: reg.status, payment: reg.payment } });
      if (!up.ok) throw new Error('db');
      return json(200, { ok: true });
    }

    // Marcar / desmarcar uma parcela do crediário
    if (event.httpMethod === 'POST' && action === 'installment') {
      const b = parseBody(event);
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id))) return json(400, { error: 'ID inválido.' });
      const cur = await sb(`registrations?select=status,payment&id=eq.${b.id}`);
      if (!cur.ok || !cur.data.length) return json(404, { error: 'Inscrição não encontrada.' });
      const reg = { status: cur.data[0].status, payment: cur.data[0].payment };
      const it = reg.payment.plan && reg.payment.plan[parseInt(b.n, 10) - 1];
      if (!it) return json(404, { error: 'Parcela não encontrada.' });
      it.paid = !!b.paid; it.paidAt = it.paid ? new Date().toISOString() : null;
      loadPricing().syncPlan(reg);
      const up = await sb(`registrations?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: reg.status, payment: reg.payment } });
      if (!up.ok) throw new Error('db');
      return json(200, { ok: true, status: reg.status });
    }

    if (event.httpMethod === 'GET' && action === 'export.csv') {
      const r = await sb('registrations?select=*&order=created_at.asc');
      if (!r.ok) throw new Error('db');
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Protocolo', 'Status', 'Data', 'Nome', 'Idade', 'CPF', 'Telefone', 'Convidado por', 'Acomodação', 'Pagamento', 'Parcelas', 'Parcelas pagas', 'Total da inscrição', 'Valor líquido (organização)', 'Contato de emergência', 'Telefone de emergência', 'Alergia', 'Restrição alimentar', 'Medicamento controlado', 'Acessibilidade', 'Autorização de menores', 'Uso de imagem']];
      for (const x of r.data) for (const p of x.participants)
        rows.push([x.protocol, x.status, x.created_at, p.name, p.age, p.cpf, p.phone, p.district, p.lodging, x.payment.method, x.payment.installments, x.payment.plan ? x.payment.plan.filter(i => i.paid).length + '/' + x.payment.plan.length : '', x.payment.total, x.payment.method === 'cartao' ? x.payment.subtotal : x.payment.total, ...infoCols(x, p, p === x.participants[0])]);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="inscricoes.csv"', 'Cache-Control': 'no-store' },
        body: '﻿' + rows.map(x => x.map(q).join(';')).join('\r\n')
      };
    }
    return json(404, { error: 'Rota não encontrada.' });
  } catch (e) {
    if (e.message === 'bad-json') return json(400, { error: 'JSON inválido.' });
    console.error('admin:', e.message);
    return json(500, { error: 'Erro ao acessar o banco de dados.' });
  }
};
