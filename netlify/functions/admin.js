const { loadConfig, loadPricing, json, parseBody, sb, checkAdmin, adminLogin, adminRefresh, authConfigured, authAdmin, isAdminUser, pinned } = require('./_shared');

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
  const action = event.path.split('/').filter(Boolean).pop();

  // Entrar e renovar a sessão: não exigem estar logado
  if (event.httpMethod === 'POST' && (action === 'login' || action === 'refresh')) {
    try {
      const b = parseBody(event);
      const r = action === 'login' ? await adminLogin(b) : await adminRefresh(b);
      return r.session ? json(200, r.session) : json(r.status, { error: r.error });
    } catch (e) {
      if (e.message === 'bad-json') return json(400, { error: 'JSON inválido.' });
      console.error('login:', e.message);
      return json(500, { error: 'Não foi possível entrar agora. Tente novamente.' });
    }
  }

  const denied = await checkAdmin(event);
  if (denied) return json(denied.status, { error: denied.error });
  try {
    // Alterar a forma de pagamento de uma inscrição (recalcula valor, taxa e parcelas)
    if (event.httpMethod === 'POST' && action === 'payment-method') {
      const b = parseBody(event);
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id))) return json(400, { error: 'ID inválido.' });
      const cur = await sb(`registrations?select=status,payment,participants&id=eq.${b.id}`);
      if (!cur.ok || !cur.data.length) return json(404, { error: 'Inscrição não encontrada.' });
      const row = cur.data[0], old = row.payment, P = loadPricing();
      if (row.status === 'cancelada') return json(409, { error: 'Esta inscrição está cancelada.' });
      if (old.paid || (old.plan && old.plan.some(x => x.paid))) return json(409, { error: 'Já existe pagamento registrado nesta inscrição. Desfaça os pagamentos antes de trocar a forma.' });
      const q = P.quote(row.participants, { method: b.method, installments: b.installments, combo: !!old.combo }, loadConfig());
      if (q.error) return json(400, { error: q.error });
      const c = q.calc, label = p => p.method === 'pix' ? 'Pix' : p.method === 'crediario' ? `Crediário ${p.installments}x` : `Cartão ${p.installments}x`;
      const payment = { ...old, method: c.method, installments: c.installments, feePercent: c.fee, subtotal: c.subtotal, discount: c.discount, combo: c.comboOk, total: c.total, paid: false };
      delete payment.plan; delete payment.checkoutUrl;   // o link antigo vale o valor antigo
      const pl = P.plan(c, new Date().toISOString()); if (pl) payment.plan = pl;
      P.logEvent(payment, event.adminEmail, 'forma-alterada', `${label(old)} → ${label(payment)}`);
      const up = await sb(`registrations?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { payment } });
      if (!up.ok) throw new Error('db');
      return json(200, { ok: true });
    }

    // ---- Usuários do painel (só no modo e-mail + senha) ----
    if (action === 'users' || action === 'user-delete') {
      if (!authConfigured()) return json(409, { error: 'Ative o login por e-mail para gerenciar usuários.' });
      const me = event.adminEmail;
      if (event.httpMethod === 'GET' && action === 'users') {
        const r = await authAdmin('users?per_page=200');
        if (!r.ok) return json(502, { error: 'Não foi possível listar os usuários.' });
        const list = (r.data.users || []).filter(isAdminUser).map(u => ({ id: u.id, email: u.email, createdAt: u.created_at, lastSignIn: u.last_sign_in_at, fixed: pinned(u.email), me: String(u.email).toLowerCase() === me }));
        return json(200, { users: list });
      }
      if (event.httpMethod === 'POST' && action === 'users') {
        const b = parseBody(event), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Informe um e-mail válido.' });
        if (password.length < 8) return json(400, { error: 'A senha precisa ter pelo menos 8 caracteres.' });
        const r = await authAdmin('users', { method: 'POST', body: { email, password, email_confirm: true, app_metadata: { role: 'admin' } } });
        if (!r.ok) {
          const msg = String((r.data && (r.data.msg || r.data.message || r.data.error_description)) || '');
          if (r.status === 422 || /already|registered|exists/i.test(msg)) return json(409, { error: 'Já existe um usuário com este e-mail.' });
          if (/password/i.test(msg)) return json(400, { error: 'Senha fraca ou inválida. Use uma senha maior e mais difícil.' });
          return json(502, { error: 'Não foi possível criar o usuário.' });
        }
        return json(200, { ok: true, email });
      }
      if (event.httpMethod === 'POST' && action === 'user-delete') {
        const id = String(parseBody(event).id || '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Usuário inválido.' });
        const g = await authAdmin('users/' + id);
        if (!g.ok) return json(404, { error: 'Usuário não encontrado.' });
        if (String(g.data.email).toLowerCase() === me) return json(400, { error: 'Você não pode remover o seu próprio acesso.' });
        if (pinned(g.data.email)) return json(400, { error: 'Este e-mail está fixo no Netlify (ADMIN_EMAILS) e só pode ser removido por lá.' });
        const d = await authAdmin('users/' + id, { method: 'DELETE' });
        return d.ok ? json(200, { ok: true }) : json(502, { error: 'Não foi possível remover.' });
      }
    }

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
      loadPricing().logEvent(reg.payment, event.adminEmail, b.status);
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
      const before = reg.status;
      it.paid = !!b.paid; it.paidAt = it.paid ? new Date().toISOString() : null;
      loadPricing().syncPlan(reg);
      loadPricing().logEvent(reg.payment, event.adminEmail, it.paid ? 'parcela-paga' : 'parcela-desfeita', `Parcela ${it.n}`);
      if (reg.status !== before) loadPricing().logEvent(reg.payment, event.adminEmail, reg.status);
      const up = await sb(`registrations?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: reg.status, payment: reg.payment } });
      if (!up.ok) throw new Error('db');
      return json(200, { ok: true, status: reg.status });
    }

    if (event.httpMethod === 'GET' && action === 'export.csv') {
      const r = await sb('registrations?select=*&order=created_at.asc');
      if (!r.ok) throw new Error('db');
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Protocolo', 'Status', 'Data', 'Nome', 'Idade', 'CPF', 'Telefone', 'Convidado por', 'Acomodação', 'Pagamento', 'Parcelas', 'Parcelas pagas', 'Total da inscrição', 'Valor líquido (organização)', 'Aprovado por', 'Aprovado em', 'Contato de emergência', 'Telefone de emergência', 'Alergia', 'Restrição alimentar', 'Medicamento controlado', 'Acessibilidade', 'Autorização de menores', 'Uso de imagem']];
      for (const x of r.data) for (const p of x.participants)
        rows.push([x.protocol, x.status, x.created_at, p.name, p.age, p.cpf, p.phone, p.district, p.lodging, x.payment.method, x.payment.installments, x.payment.plan ? x.payment.plan.filter(i => i.paid).length + '/' + x.payment.plan.length : '', x.payment.total, x.payment.method === 'cartao' ? x.payment.subtotal : x.payment.total, ...(x.status === 'confirmada' ? (a => [a ? a.by : '', a ? a.at : ''])(loadPricing().approvedBy(x.payment)) : ['', '']), ...infoCols(x, p, p === x.participants[0])]);
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
