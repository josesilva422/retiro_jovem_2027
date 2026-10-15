(async () => {
  const $ = (s, el = document) => el.querySelector(s);
  const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cfg = await fetch('/api/config').then(r => r.json());
  new Image().src = '/img/jesus-joinha.png'; // pré-carrega a imagem da animação
  const form = $('#regForm'), people = $('#people'), MAX = 15;

  // ---------- Máscaras e validação ----------
  const maskCpf = v => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const maskPhone = v => { v = v.replace(/\D/g, '').slice(0, 11); return v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, ''); };
  function validCpf(raw) {
    const c = raw.replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }

  // ---------- Contatos para pagamento ----------
  const contacts = cfg.contacts || [];
  const contactCards = mine => [...contacts].sort((a, b) => (b.district === mine) - (a.district === mine)).map(c => {
    const msg = encodeURIComponent('Olá! Quero combinar o pagamento da inscrição no RECONNECT.' + (window.__protocol ? ' Protocolo: ' + window.__protocol : ''));
    return `<div class="contact${c.district === mine ? ' mine' : ''}">
      <span class="c-dist">${c.district}${c.district === mine ? ' · seu distrito' : ''}</span>
      <b>${c.name}</b>${c.role ? `<small>${c.role}</small>` : ''}
      <a class="btn sm" href="https://wa.me/${c.whatsapp}?text=${msg}" target="_blank" rel="noopener">WhatsApp ${c.display}</a>
    </div>`;
  }).join('');
  const renderPayNote = () => {
    const note = $('#payNote'); if (!note) return;
    const first = $('#people .person [name=district]');
    note.innerHTML = '<b>Como pagar:</b> o pagamento é feito no seu distrito. Depois de enviar o pré-cadastro, entre em contato com uma das pessoas abaixo.<div class="contacts">' + contactCards(first ? first.value : '') + '</div>';
  };

  // ---------- Participantes ----------
  let uid = 0;
  const districtField = id => cfg.districts?.length
    ? `<select name="district" required><option value="">Selecione quem convidou</option>${cfg.districts.map(d => `<option>${d}</option>`).join('')}</select>`
    : `<input name="district" placeholder="Seu distrito" required autocomplete="off">`;

  // Só no responsável (participante 1): contato de emergência e saúde
  const HQ = [
    ['allergy', 'Possui alguma alergia?', 'Qual(is)?'],
    ['diet', 'Possui restrição alimentar?', 'Qual(is)?'],
    ['medication', 'Toma medicamento controlado?', 'Qual(is) e em quais horários?'],
    ['accessibility', 'Precisa de acessibilidade ou atenção especial? (mobilidade, deficiência etc.)', 'Descreva o que precisa']
  ];
  // Contato de emergência: só o responsável (participante 1)
  const emergencyBox = () => `<div class="respbox">
      <h5>Contato de emergência <small>(do responsável pela inscrição)</small></h5>
      <p class="hint">Só a organização tem acesso a estas informações.</p>
      <div class="grid2">
        <div class="field"><label>Contato de emergência (nome)</label><input name="em-name" placeholder="Nome de quem avisar" autocomplete="off"><div class="err"></div></div>
        <div class="field"><label>Telefone do contato</label><input name="em-phone" inputmode="tel" placeholder="(00) 00000-0000" autocomplete="off"><div class="err"></div></div>
        <div class="field full"><label>Quem é essa pessoa? <span class="opt">(opcional)</span></label><input name="em-rel" placeholder="Ex.: mãe, esposo(a), amigo(a)" autocomplete="off"></div>
      </div>
    </div>`;
  // Saúde e acessibilidade: todos os participantes
  const healthBox = id => `<div class="respbox health">
      <h5>Saúde e acessibilidade</h5>
      <p class="hint">Responda para este participante. Só a organização tem acesso.</p>
      ${HQ.map(([k, q, ph]) => `<div class="hq"><label for="h-${k}-${id}">${q}</label><select name="h-${k}" id="h-${k}-${id}"><option value="0">Não</option><option value="1">Sim</option></select><input name="h-${k}-t" placeholder="${ph}" maxlength="200" hidden><div class="err"></div></div>`).join('')}
    </div>`;

  function addPerson() {
    if (people.children.length >= MAX) return;
    const id = ++uid, first = people.children.length === 0;
    const el = document.createElement('div');
    el.className = 'person';
    el.innerHTML = `
      <div class="person-head"><h4>${first ? 'Participante 1 (responsável)' : 'Participante'}</h4>${first ? '' : '<button type="button" class="rm">Remover</button>'}</div>
      <div class="grid2">
        <div class="field full"><label>Nome completo</label><input name="name" placeholder="Nome e sobrenome" autocomplete="${first ? 'name' : 'off'}" required><div class="err"></div></div>
        <div class="field"><label>Idade</label><input name="age" type="number" min="0" max="99" inputmode="numeric" placeholder="Ex.: 18" required><small class="hint">0 a 4 anos: gratuito · 5 a 9: meia</small><div class="err"></div></div>
        <div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" placeholder="000.000.000-00" required><div class="err"></div><label class="nocpf"><input type="checkbox" name="nocpf"><span>Não possui CPF (criança)</span></label></div>
        <div class="field"><label>Telefone para contato</label><input name="phone" inputmode="tel" placeholder="(00) 00000-0000" autocomplete="${first ? 'tel' : 'off'}" required><div class="err"></div></div>
        <div class="field"><label>Convidado por</label>${districtField(id)}<div class="err"></div></div>
      </div>
      <label>Acomodação</label>
      <div class="choice-row">
        <label class="choice"><input type="radio" name="lodging-${id}" value="camping" required><span><b>⛺ Barraca</b><small>Levo minha barraca (camping)</small></span></label>
        <label class="choice"><input type="radio" name="lodging-${id}" value="dormitorio"><span><b>🛏️ Dormitório</b><small>Vagas limitadas</small></span></label>
      </div><div class="err lodge-err"></div>${first ? emergencyBox() : ''}${healthBox(id)}`;
    el.dataset.id = id;
    people.appendChild(el);
    $('.rm', el)?.addEventListener('click', () => { el.remove(); renumber(); summary(); renderPayNote(); });
    $('[name=cpf]', el).addEventListener('input', e => e.target.value = maskCpf(e.target.value));
    $('[name=nocpf]', el).addEventListener('change', e => {
      const c = $('[name=cpf]', el), on = e.target.checked;
      c.disabled = on; c.required = !on; if (on) { c.value = ''; c.classList.remove('bad'); c.closest('.field').querySelector('.err').textContent = ''; }
      c.placeholder = on ? 'Sem CPF' : '000.000.000-00';
    });
    $('[name=phone]', el).addEventListener('input', e => e.target.value = maskPhone(e.target.value));
    if (first) $('[name=em-phone]', el).addEventListener('input', e => e.target.value = maskPhone(e.target.value));
    HQ.forEach(([k]) => $('[name=h-' + k + ']', el).addEventListener('change', e => {
      const t = $('[name=h-' + k + '-t]', el); t.hidden = e.target.value !== '1'; if (t.hidden) t.value = '';
    }));
    el.addEventListener('change', () => { summary(); renderPayNote(); });
    renumber(); summary(); renderPayNote();
    if (!first) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function renumber() {
    [...people.children].forEach((p, i) => { if (i) $('h4', p).textContent = `Participante ${i + 1}`; });
    $('#addPerson').disabled = people.children.length >= MAX;
  }
  const collect = () => [...people.children].map(p => ({
    el: p,
    name: $('[name=name]', p).value.trim(), age: $('[name=age]', p).value, nocpf: $('[name=nocpf]', p).checked, cpf: $('[name=nocpf]', p).checked ? '' : $('[name=cpf]', p).value,
    phone: $('[name=phone]', p).value, district: $('[name=district]', p).value.trim(),
    lodging: p.querySelector('input[type=radio]:checked')?.value,
    health: Object.fromEntries(HQ.map(([k]) => [k, { has: $('[name=h-' + k + ']', p).value === '1', text: $('[name=h-' + k + '-t]', p).value.trim() }]))
  }));

  // ---------- Menores de idade e informações do responsável ----------
  const minorsState = () => {
    const list = collect().map(p => ({ name: p.name, age: p.age === '' ? null : +p.age }));
    const minors = list.filter(p => p.age !== null && p.age < 18);
    const respMinor = list[0] && list[0].age !== null && list[0].age < 18;
    const acc = $('#accompanied').value;
    const needAuth = minors.length > 0 && (respMinor || acc === '0');
    return { minors, any: minors.length > 0, respMinor, acc, needAuth };
  };
  function syncMinors() {
    const m = minorsState();
    $('#minorBox').hidden = !m.any;
    $('#accWrap').hidden = !m.any || m.respMinor;
    $('#authBox').hidden = !m.needAuth;
    const names = m.minors.map(p => p.name).filter(Boolean).join('|');
    $('#authLink').href = '/autorizacao.html' + (names ? '?menores=' + encodeURIComponent(names) : '');
    if (!m.needAuth) $('#authAck').checked = false;
  }
  const collectInfo = () => {
    const p = people.children[0], m = minorsState();
    return {
      emergency: { name: $('[name=em-name]', p).value.trim(), phone: $('[name=em-phone]', p).value, relation: $('[name=em-rel]', p).value.trim() },
      imageConsent: $('#imgAck').checked,
      minors: { accompanied: m.respMinor ? false : (m.acc === '' ? null : m.acc === '1'), authorizationAck: $('#authAck').checked }
    };
  };

  // ---------- Quadro de valores ----------
  const LODGE = { camping: 'Barraca', dormitorio: 'Dormitório' };
  const ICON = { camping: '⛺', dormitorio: '🛏️' };
  const maxInst = cfg.maxInstallments || 1;
  document.querySelectorAll('[data-maxinst]').forEach(e => e.textContent = maxInst);
  const credMax = cfg.crediario?.maxInstallments || 3;
  const fmtDate = iso => iso.split('-').reverse().join('/');
  const untilTxt = cfg.crediario?.until ? ` Disponível até ${fmtDate(cfg.crediario.until)}.` : '';
  const cardWho = (cfg.cardDistricts || []).join(', ');
  $('#cardWho').textContent = cardWho;
  const minPeople = cfg.combo?.minParticipants || 3;
  const priceBox = $('#priceBox');
  if (priceBox) {
    const dp = cfg.discountPrices || cfg.prices;
    priceBox.innerHTML = `<h3>Valores da inscrição</h3>
      <div class="price-grid">${['dormitorio', 'camping'].map(k => `<div class="pcard"><span class="pico">${ICON[k]}</span><b>${LODGE[k]}</b><div class="pv">${brl(cfg.prices[k])}</div><small>À vista: <b>${brl(dp[k])}</b> (10% de desconto)</small></div>`).join('')}</div>
      <ul class="rules">
        <li><b>À vista (Pix):</b> 10% de desconto.</li>
        <li><b>Crediário:</b> em 2x ou 3x, uma parcela por mês, sem acréscimo (sem o desconto à vista). As parcelas são acompanhadas pela organização.${untilTxt}</li>
        <li><b>Cartão de crédito:</b> em até ${maxInst}x, com acréscimo da maquininha. Disponível para quem foi convidado pelo distrito ${cardWho}.</li>
        <li><b>Combo familiar</b> (a partir de ${minPeople} participantes): 10% de desconto também no pagamento parcelado.</li>
        <li><b>Faixa etária:</b> de 0 a 4 anos, gratuito · de 5 a 9 anos, meia inscrição · a partir de 10 anos, valor integral.</li>
      </ul>
      <p class="pnote">As regras de faixa etária referem-se ao valor da inscrição. As condições de utilização dos dormitórios serão explicadas no momento da inscrição.</p>`;
  }

  // ---------- Pagamento e resumo ----------
  const method = () => form.method.value;
  const installments = $('#installments');
  const toParts = list => list.map(p => ({ age: p.age === '' ? 0 : +p.age, lodging: p.lodging, district: p.district }));
  const ages = () => collect().map(p => ({ age: p.age === '' ? NaN : +p.age })).filter(p => !Number.isNaN(p.age));
  const payersNow = () => ages().filter(p => p.age >= 5).length;
  const setMethod = v => { form.querySelector('input[name=method][value=' + v + ']').checked = true; };

  // Quais formas de pagamento aparecem (crediário só até a data limite; cartão só para o distrito liberado)
  function syncMethods() {
    const cardOk = Pricing.cardAllowed(toParts(collect()), cfg), credOk = Pricing.crediarioOpen(cfg);
    $('#cardChoice').hidden = !cardOk;
    $('#credChoice').hidden = !credOk;
    $('#cardHint').hidden = cardOk || !(cfg.cardDistricts || []).length;
    $('#credUntil').textContent = untilTxt.trim();
    if (method() === 'cartao' && !cardOk) setMethod('pix');
    if (method() === 'crediario' && !credOk) setMethod('pix');
  }
  let filledFor = '';
  function fillInstallments() {
    const m = method();
    $('#instWrap').hidden = m === 'pix';
    if (m === 'pix' || filledFor === m) return;
    filledFor = m;
    const min = 2, max = m === 'crediario' ? credMax : maxInst, keep = +installments.value;
    installments.innerHTML = '';
    for (let i = min; i <= max; i++) installments.add(new Option(i + 'x', i));
    installments.value = keep >= min && keep <= max ? keep : (m === 'crediario' ? max : min);
  }

  function totals() {
    const list = collect();
    const payers = payersNow();
    const eligible = list.length >= minPeople && payers >= 1;
    $('#comboWrap').hidden = !eligible;
    if (!eligible) $('#combo').checked = false;
    const combo = eligible && $('#combo').checked;
    const calc = Pricing.compute(toParts(list), { method: method(), installments: installments.value, combo }, cfg);
    return { list, calc, n: calc.installments, combo: calc.comboOk, payers };
  }
  function summary() {
    syncMethods(); fillInstallments(); syncMinors();
    const { list, calc, n, payers } = totals();
    const m = method(), cmb = calc.comboOk;
    [...installments.options].forEach(o => {
      const k = +o.value;
      const c = Pricing.compute(toParts(list), { method: m, installments: k, combo: cmb }, cfg);
      o.textContent = m === 'crediario' ? `${k}x de ${brl(c.total / k)} por mês` : `${k}x de ${brl(c.total / k)} (${brl(c.total)})`;
    });
    const BAND = { gratis: ' · gratuito', meia: ' · meia inscrição', integral: '' };
    const rows = list.map((p, i) => {
      const l = calc.lines[i], age = p.age === '' ? null : +p.age;
      return `<div class="row"><span>${p.name || 'Participante ' + (i + 1)} · ${p.lodging ? LODGE[p.lodging] : 'acomodação?'}${age === null ? '' : BAND[l.band]}</span><span>${p.lodging ? (l.full === 0 ? 'Grátis' : brl(l.full)) : '—'}</span></div>`;
    }).join('');
    const why = calc.comboOk ? 'Combo familiar (10%)' : 'Desconto à vista no Pix (10%)';
    const tip = !calc.discounted && payers > 0 ? `<div class="hint-row">Dica: pagando à vista no Pix você ganha 10% de desconto.</div>` : '';
    $('#summary').innerHTML = `<b>Resumo da inscrição</b>${rows}` +
      (calc.discount > 0 ? `<div class="row disc"><span>${why}</span><span>−${brl(calc.discount)}</span></div>` : '') +
      (calc.fee > 0 ? `<div class="row"><span>Acréscimo da maquininha (${String(calc.fee).replace('.', ',')}%)</span><span>${brl(calc.total - calc.subtotal)}</span></div>` : '') +
      `<div class="row total"><span>Total</span><span>${m === 'pix' ? brl(calc.total) : `${n}x de ${brl(calc.total / n)}${m === 'crediario' ? ' / mês' : ''}`}</span></div>` + tip;
  }
  form.addEventListener('change', summary);
  form.addEventListener('input', summary);
  $('#addPerson').addEventListener('click', addPerson);
  addPerson();

  // ---------- Estado: aberto / em breve ----------
  const open = cfg.registrationOpen;
  form.classList.toggle('locked', !open);
  form.querySelectorAll('input,select,button').forEach(el => { if (!open) el.disabled = true; });
  if (open) { const s = $('#stickyCta'); if (s) s.textContent = 'Fazer minha inscrição'; }
  if (open) $('#regLead').textContent = 'Preencha os dados abaixo. Você pode adicionar outros participantes na mesma inscrição.';
  if (cfg.contactWhatsapp) $('#footContact').innerHTML = `Dúvidas: <a href="https://wa.me/55${cfg.contactWhatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp da organização</a>`;

  // Lista de espera (hero + seção de inscrição)
  document.querySelectorAll('.wait-form').forEach(wf => {
    const wm = wf.querySelector('.form-msg');
    wf.phone.addEventListener('input', e => e.target.value = maskPhone(e.target.value));
    wf.addEventListener('submit', async e => {
      e.preventDefault(); wm.className = 'form-msg';
      const r = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: wf.name.value, phone: wf.phone.value }) });
      const j = await r.json().catch(() => ({}));
      wm.className = 'form-msg ' + (r.ok ? 'ok' : 'error');
      wm.textContent = r.ok ? 'Pronto! Avisaremos você assim que as inscrições abrirem. 🙌' : (j.error || 'Não foi possível salvar.');
      if (r.ok) wf.reset();
    });
  });
  document.querySelectorAll('[data-closed]').forEach(el => el.hidden = open);
  document.querySelectorAll('[data-open]').forEach(el => el.hidden = !open);

  // ---------- Envio ----------
  function setErr(input, msg) {
    input.classList.toggle('bad', !!msg);
    const box = input.closest('.field, .hq')?.querySelector('.err'); if (box) box.textContent = msg || '';
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#regMsg'); msg.className = 'form-msg error'; msg.textContent = '';
    let ok = true;
    const seen = new Set();
    for (const p of collect()) {
      const f = n => $(`[name=${n}]`, p.el);
      const check = (n, bad, text) => { setErr(f(n), bad ? text : ''); if (bad) ok = false; };
      check('name', p.name.split(/\s+/).filter(Boolean).length < 2, 'Informe nome e sobrenome.');
      check('age', p.age === '' || !(p.age >= 0 && p.age <= 99), 'Idade inválida.');
      if (p.nocpf) check('cpf', p.age === '' || +p.age >= 18, 'Maiores de 18 anos precisam informar o CPF.');
      else {
        const dupe = seen.has(p.cpf); seen.add(p.cpf);
        check('cpf', !validCpf(p.cpf) || dupe, dupe ? 'CPF repetido na inscrição.' : 'CPF inválido.');
      }
      check('phone', p.phone.replace(/\D/g, '').length < 10, 'Telefone inválido.');
      check('district', !p.district, 'Selecione quem convidou.');
      HQ.forEach(([k]) => check('h-' + k + '-t', p.health[k].has && !p.health[k].text, 'Descreva para continuar.'));
      $('.lodge-err', p.el).textContent = p.lodging ? '' : 'Escolha camping ou dormitório.';
      if (!p.lodging) ok = false;
    }
    {   // contato de emergência, saúde e menores (só do responsável)
      const first = people.children[0], setE = (inp, bad, t) => { setErr(inp, bad ? t : ''); if (bad) ok = false; };
      setE($('[name=em-name]', first), $('[name=em-name]', first).value.trim().length < 3, 'Informe o nome do contato de emergência.');
      setE($('[name=em-phone]', first), $('[name=em-phone]', first).value.replace(/\D/g, '').length < 10, 'Telefone inválido.');
      const m = minorsState();
      $('#accErr').textContent = ''; $('#authErr').textContent = '';
      if (m.any && !m.respMinor && m.acc === '') { ok = false; $('#accErr').textContent = 'Informe se os menores estarão acompanhados do responsável legal.'; }
      if (m.needAuth && !$('#authAck').checked) { ok = false; $('#authErr').textContent = 'Confirme que levará a autorização assinada no dia do retiro.'; }
    }
    if (collect().every(p => p.nocpf)) { ok = false; msg.textContent = 'Pelo menos um participante (o responsável) precisa informar o CPF.'; }
    if (!$('#agree').checked) { ok = false; msg.textContent = 'Marque a confirmação para continuar.'; }
    else if (!$('#imgAck').checked) { ok = false; msg.textContent = 'Marque a autorização de uso de imagem para continuar.'; }
    if (!ok) { msg.textContent ||= 'Revise os campos destacados.'; $('.bad, .lodge-err:not(:empty)', form)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

    window.__minors = minorsState().minors.map(p => p.name).filter(Boolean).join('|');
    const t = totals(), btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: t.list.map(({ el, ...p }) => p),
          payment: { method: method(), installments: t.n, combo: t.combo },
          info: collectInfo()
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Não foi possível enviar. Tente novamente.');
      showSuccess(j);
    } catch (err) { msg.textContent = err.message; }
    btn.disabled = false; btn.textContent = 'Enviar pré-cadastro';
  });

  function showSuccess(j) {
    form.hidden = true; $('#success').hidden = false; $('#protocol').textContent = j.protocol;
    const valor = j.total ? brl(j.total) : null;
    const mine = $('#people .person [name=district]')?.value || '';
    window.__protocol = j.protocol;
    const how = j.method === 'pix' ? 'Pix (à vista)' : j.method === 'crediario' ? `crediário em ${j.installments}x (uma parcela por mês)` : `cartão de crédito em ${j.installments}x`;
    const auth = j.authorization ? `<div class="planbox"><b>Autorização dos responsáveis</b><small>Leve a autorização assinada no dia do retiro. <a href="/autorizacao.html?protocolo=${encodeURIComponent(j.protocol)}&menores=${encodeURIComponent(window.__minors || '')}" target="_blank" rel="noopener"><b>Baixar o modelo (já com seu protocolo)</b></a></small></div>` : '';
    const plan = j.plan ? `<div class="planbox"><b>Parcelas</b>${j.plan.map(x => `<div class="row"><span>Parcela ${x.n} · ${fmtDate(x.due)}</span><span>${brl(x.amount)}</span></div>`).join('')}<small>As parcelas são acompanhadas pela organização. Combine a primeira com uma das pessoas abaixo.</small></div>` : '';
    $('#payInstr').innerHTML = `<b>Próximo passo: realizar o pagamento</b><br>${valor ? 'Valor: <b>' + valor + '</b> · ' : ''}Forma escolhida: ${how}<br>${plan}${auth}
      Entre em contato com uma destas pessoas e informe o protocolo <b>${j.protocol}</b>:
      <div class="contacts">${contactCards(mine)}</div>`;
    $('#inscricao').scrollIntoView({ behavior: 'smooth' });
    celebrate();
  }

  // Animação de comemoração: a imagem sobe de baixo para cima ao enviar o pré-cadastro
  function celebrate() {
    const wrap = document.createElement('div');
    wrap.className = 'cele';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="cele-bg"></div><div class="cele-box"><div class="cele-bubble">Pré-cadastro enviado!</div><div class="cele-pic"><img src="/img/jesus-joinha.png" alt=""></div></div>';
    document.body.appendChild(wrap);
    const close = () => { if (wrap.classList.contains('out')) return; wrap.classList.add('out'); setTimeout(() => wrap.remove(), 2000); };
    wrap.addEventListener('click', close);
    setTimeout(() => wrap.classList.add('in'), 40);
    setTimeout(close, 5200);   // sobe (2,6s), fica um pouco e desce
  }
})();
