// Regras de preço e pagamento (usadas pelo site e pelo servidor, para o valor ser sempre o mesmo).
//  - Pix: à vista, com 10% de desconto.
//  - Crediário: 2x ou 3x, uma parcela por mês, sem acréscimo e sem desconto (a menos do combo familiar).
//  - Cartão (maquininha): até 12x com acréscimo, só para quem foi convidado por distrito liberado (Veiga Jardim).
//  - Combo familiar (3+ participantes): 10% de desconto também no parcelado.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const r2 = n => Math.round(n * 100) / 100;
  // 0 a 4 anos: gratuito · 5 a 9: meia inscrição · 10 ou mais: valor integral
  const band = age => (age <= 4 ? 'gratis' : age <= 9 ? 'meia' : 'integral');
  const unit = (p, table) => {
    const b = band(p.age), base = Number(table[p.lodging]) || 0;
    return b === 'gratis' ? 0 : b === 'meia' ? r2(base / 2) : base;
  };

  const crediarioOpen = (cfg, now) => {
    const c = cfg.crediario || {};
    if (!c.enabled) return false;
    if (!c.until) return true;                                   // sem data limite definida
    return (now || new Date()) <= new Date(c.until + 'T23:59:59-03:00');
  };
  const cardAllowed = (participants, cfg) => {
    const d = participants[0] && participants[0].district;       // vale o "Convidado por" do responsável
    return !!d && (cfg.cardDistricts || []).includes(d);
  };
  // Parcelas liberadas no cartão: lista em cfg.cardInstallments (só as que têm taxa conhecida) ou 2..max.
  const cardOptions = cfg => {
    if (Array.isArray(cfg.cardInstallments) && cfg.cardInstallments.length) return cfg.cardInstallments.slice().sort((a, b) => a - b);
    const max = cfg.maxInstallments || 12, out = [];
    for (let i = 2; i <= max; i++) out.push(i);
    return out;
  };
  const limits = (method, cfg) => method === 'crediario'
    ? { min: 2, max: (cfg.crediario && cfg.crediario.maxInstallments) || 3 }
    : method === 'cartao' ? { min: 2, max: cfg.maxInstallments || 12 } : { min: 1, max: 1 };

  // participants: [{ age, lodging, district }]; payment: { method: 'pix'|'crediario'|'cartao', installments, combo }
  function compute(participants, payment, cfg) {
    const method = ['pix', 'crediario', 'cartao'].includes(payment.method) ? payment.method : 'pix';
    const lim = limits(method, cfg);
    let n = method === 'pix' ? 1 : Math.min(Math.max(parseInt(payment.installments, 10) || lim.min, lim.min), lim.max);
    if (method === 'cartao') { const o = cardOptions(cfg); if (!o.includes(n)) n = o.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), o[0]); }
    const payers = participants.filter(p => p.age >= 5).length;            // quem paga (inclui meia)
    const minPeople = (cfg.combo && cfg.combo.minParticipants) || 3;
    const comboOk = !!payment.combo && participants.length >= minPeople;     // combo familiar
    const avista = method === 'pix';
    const discounted = avista || comboOk;                                   // o desconto não acumula
    const table = discounted ? (cfg.discountPrices || cfg.prices) : cfg.prices;
    const lines = participants.map(p => ({ band: band(p.age), lodging: p.lodging, full: unit(p, cfg.prices), price: unit(p, table) }));
    const listTotal = r2(lines.reduce((s, l) => s + l.full, 0));
    const subtotal = r2(lines.reduce((s, l) => s + l.price, 0));
    const fee = method === 'cartao' ? Number(cfg.installmentFees && cfg.installmentFees[String(n)]) || 0 : 0;
    const total = r2(fee > 0 ? subtotal / (1 - fee / 100) : subtotal);   // por dentro: a taxa da maquininha sai do total e a organização fica com o subtotal
    return { method, installments: n, payers, comboOk, minPeople, avista, discounted, lines, listTotal, subtotal, discount: r2(listTotal - subtotal), fee, total, min: lim.min, max: lim.max };
  }

  // Valida a forma de pagamento e calcula o valor. Usado pelo servidor.
  function quote(participants, payment, cfg, now) {
    payment = payment || {};
    if (!['pix', 'crediario', 'cartao'].includes(payment.method)) return { error: 'Escolha a forma de pagamento.' };
    if (payment.method === 'crediario' && !crediarioOpen(cfg, now)) return { error: 'O pagamento parcelado pelo crediário não está mais disponível.' };
    if (payment.method === 'cartao' && !cardAllowed(participants, cfg))
      return { error: 'O parcelamento no cartão está disponível apenas para inscrições convidadas por: ' + (cfg.cardDistricts || []).join(', ') + '.' };
    if (payment.method !== 'pix') {
      const lim = limits(payment.method, cfg), n = parseInt(payment.installments, 10);
      if (payment.method === 'cartao') {
        if (!cardOptions(cfg).includes(n)) return { error: 'Parcelas disponíveis no cartão: ' + cardOptions(cfg).map(x => x + 'x').join(', ') + '.' };
      } else if (!(n >= lim.min && n <= lim.max)) return { error: 'Número de parcelas inválido (de ' + lim.min + ' a ' + lim.max + ').' };
    }
    const calc = compute(participants, payment, cfg);
    if (calc.payers < 1) return { error: 'É preciso ao menos um participante com 5 anos ou mais (crianças de 0 a 4 anos são gratuitas).' };
    if (payment.combo && !calc.comboOk) return { error: 'O combo familiar vale para inscrições com ' + calc.minPeople + ' ou mais participantes.' };
    return { calc };
  }

  // Parcelas do crediário: uma por mês, a partir da data do cadastro.
  function addMonths(iso, i) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10);
  }
  function plan(calc, startIso) {
    if (calc.method !== 'crediario') return null;
    const n = calc.installments, base = Math.floor((calc.total / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => ({
      n: i + 1, amount: i === n - 1 ? r2(calc.total - base * (n - 1)) : base,
      due: addMonths(startIso, i), paid: false, paidAt: null
    }));
  }

  // Mantém status e "pago" coerentes com as parcelas do crediário:
  // 1ª parcela paga => inscrição confirmada; todas pagas => quitado.
  function syncPlan(reg) {
    const pl = reg.payment && reg.payment.plan;
    if (!pl) return reg;
    const paid = pl.filter(x => x.paid).length;
    if (reg.status !== 'cancelada') reg.status = paid > 0 ? 'confirmada' : 'pre-cadastro';
    reg.payment.paid = paid === pl.length;
    return reg;
  }
  const planInfo = payment => {
    const pl = payment && payment.plan; if (!pl) return null;
    const next = pl.find(x => !x.paid);
    return { paid: pl.filter(x => x.paid).length, total: pl.length, next: next ? next.due : null, amount: next ? next.amount : null };
  };

  // Informações só do responsável (1º participante): contato de emergência, saúde e menores de idade.
  const cl = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n || 200);
  const HEALTH = { allergy: 'alergia', diet: 'restrição alimentar', medication: 'medicamento controlado', accessibility: 'acessibilidade ou atenção especial' };
  // Saúde e acessibilidade: uma resposta por participante.
  function checkHealth(raw, participants) {
    const out = [];
    for (let i = 0; i < participants.length; i++) {
      const h = (raw && raw[i] && raw[i].health) || {}, res = {};
      for (const k of Object.keys(HEALTH)) {
        const x = h[k] || {}, has = x.has === true, text = cl(x.text, 200);
        if (has && !text) return { error: 'Descreva (' + HEALTH[k] + ') para ' + participants[i].name + '.' };
        res[k] = { has, text: has ? text : '' };
      }
      out.push(res);
    }
    return { value: out };
  }

  function checkInfo(info, participants) {
    info = info || {};
    const em = info.emergency || {}, name = cl(em.name, 80), phone = String(em.phone || '').replace(/\D/g, ''), relation = cl(em.relation, 40);
    if (name.length < 3) return { error: 'Informe o nome do contato de emergência.' };
    if (phone.length < 10 || phone.length > 11) return { error: 'Informe um telefone válido para o contato de emergência.' };
    if (info.imageConsent !== true) return { error: 'A autorização de uso de imagem é necessária para concluir a inscrição.' };
    const anyMinor = participants.some(x => x.age < 18), respMinor = participants[0].age < 18, m = info.minors || {};
    let accompanied = null, required = false, ack = false;
    if (anyMinor) {
      if (respMinor) accompanied = false;                // responsável menor de idade: precisa de autorização
      else {
        if (typeof m.accompanied !== 'boolean') return { error: 'Informe se os menores de idade estarão acompanhados de pai, mãe ou responsável legal.' };
        accompanied = m.accompanied;
      }
      required = !accompanied; ack = m.authorizationAck === true;
      if (required && !ack) return { error: 'Confirme que a autorização assinada dos responsáveis será entregue no dia do retiro.' };
    }
    return { value: { emergency: { name, phone, relation }, imageConsent: info.imageConsent === true, minors: { any: anyMinor, accompanied, authorizationRequired: required, authorizationAck: ack } } };
  }

  return { compute, quote, plan, syncPlan, planInfo, checkInfo, checkHealth, cardOptions, band, crediarioOpen, cardAllowed };
});
