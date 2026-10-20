const { json, parseBody, sb } = require('./_shared');
const ip = require('./_infinitepay');

// Aviso de pagamento aprovado da InfinitePay. O aviso NÃO tem assinatura, então nada é confirmado
// só por ele: o pedido precisa existir e o pagamento é conferido de novo na API (payment_check).
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    if (!ip.enabled()) return json(200, { ok: true });
    const b = parseBody(event);
    const m = /^(RC-[0-9A-F]{6})(-T1)?$/.exec(String(b.order_nsu || '').trim().toUpperCase());
    if (!m) return json(200, { ok: true, ignored: true });
    const protocol = m[1], isTest = !!m[2];

    const g = await sb(`registrations?select=id,status,payment&protocol=eq.${protocol}`);
    if (!g.ok) throw new Error('db');
    if (!g.data.length) return json(200, { ok: true, ignored: true });
    const reg = g.data[0], p = reg.payment;
    if (p.paid && p.transactionNsu === b.transaction_nsu) return json(200, { ok: true, duplicate: true });   // reenvio do aviso

    if (isTest && !p.testAllowed) return json(200, { ok: true, ignored: true });   // teste só vale se o painel gerou o link

    const c = await ip.check({ order_nsu: isTest ? protocol + ip.TEST_SUFFIX : protocol, transaction_nsu: b.transaction_nsu, slug: b.invoice_slug });
    if (!c.ok || !c.data || c.data.success !== true) return json(400, { error: 'Não foi possível conferir o pagamento.' });   // a InfinitePay tenta de novo
    if (c.data.paid !== true) return json(200, { ok: true, paid: false });
    const expected = isTest ? ip.TEST_CENTS : ip.cents(p.subtotal);
    if (c.data.amount !== expected) { console.error('infinitepay: valor diferente', protocol, c.data.amount, expected); return json(200, { ok: true, ignored: 'amount' }); }

    const payment = { ...p, ...(isTest ? { testPaid: true } : {}), paid: true, paidAt: new Date().toISOString(), gateway: 'infinitepay', transactionNsu: b.transaction_nsu, paidAmount: c.data.paid_amount / 100, paidInstallments: c.data.installments, receiptUrl: typeof b.receipt_url === 'string' ? b.receipt_url : undefined };
    const up = await sb(`registrations?id=eq.${reg.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: reg.status === 'cancelada' ? 'cancelada' : 'confirmada', payment } });
    if (!up.ok) throw new Error('db');
    return json(200, { ok: true });
  } catch (e) {
    console.error('infinitepay-webhook:', e.message);
    return json(400, { error: 'Falha ao processar.' });
  }
};
