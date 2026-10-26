const { json, parseBody, sb, loadPricing } = require('./_shared');
const ip = require('./_infinitepay');

// Aviso de pagamento aprovado da InfinitePay. O aviso NÃO tem assinatura, então nada é confirmado
// só por ele: o pedido precisa existir e o pagamento é conferido de novo na API (payment_check).
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    if (!ip.enabled()) return json(200, { ok: true });
    const b = parseBody(event);
    const protocol = String(b.order_nsu || '').trim().toUpperCase();
    if (!/^RC-[0-9A-F]{6}$/.test(protocol)) return json(200, { ok: true, ignored: true });

    const g = await sb(`registrations?select=id,status,payment&protocol=eq.${protocol}`);
    if (!g.ok) throw new Error('db');
    if (!g.data.length) return json(200, { ok: true, ignored: true });
    const reg = g.data[0], p = reg.payment;
    if (p.paid && p.transactionNsu === b.transaction_nsu) return json(200, { ok: true, duplicate: true });   // reenvio do aviso

    const c = await ip.check({ order_nsu: protocol, transaction_nsu: b.transaction_nsu, slug: b.invoice_slug });
    if (!c.ok || !c.data || c.data.success !== true) return json(400, { error: 'Não foi possível conferir o pagamento.' });   // a InfinitePay tenta de novo
    if (c.data.paid !== true) return json(200, { ok: true, paid: false });
    if (c.data.amount !== ip.cents(p.subtotal)) { console.error('infinitepay: valor diferente', protocol, c.data.amount, ip.cents(p.subtotal)); return json(200, { ok: true, ignored: 'amount' }); }

    const payment = { ...p, paid: true, paidAt: new Date().toISOString(), gateway: 'infinitepay', transactionNsu: b.transaction_nsu, paidAmount: c.data.paid_amount / 100, paidInstallments: c.data.installments, receiptUrl: typeof b.receipt_url === 'string' ? b.receipt_url : undefined };
    if (reg.status !== 'cancelada') loadPricing().logEvent(payment, 'InfinitePay (automático)', 'confirmada', 'Pagamento aprovado no cartão');
    const up = await sb(`registrations?id=eq.${reg.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: reg.status === 'cancelada' ? 'cancelada' : 'confirmada', payment } });
    if (!up.ok) throw new Error('db');
    return json(200, { ok: true });
  } catch (e) {
    console.error('infinitepay-webhook:', e.message);
    return json(400, { error: 'Falha ao processar.' });
  }
};
