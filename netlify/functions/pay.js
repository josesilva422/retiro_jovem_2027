const { json, parseBody } = require('./_shared');
const ip = require('./_infinitepay');

// Devolve o link de pagamento no cartão (InfinitePay) de uma inscrição pelo protocolo.
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    if (!ip.enabled()) return json(503, { error: 'O pagamento online ainda não está disponível. Fale com o responsável do seu distrito.' });
    const q = String(parseBody(event).protocol || '').trim().toUpperCase();
    if (!/^RC-[0-9A-F]{6}$/.test(q)) return json(400, { error: 'Protocolo inválido.' });
    const r = await ip.ensureLink(q);
    return r.url ? json(200, { url: r.url }) : json(r.status, { error: r.error });
  } catch (e) {
    if (e.message === 'bad-json') return json(400, { error: 'JSON inválido.' });
    console.error('pay:', e.message);
    return json(502, { error: 'Não foi possível gerar o link agora. Tente novamente ou fale com o responsável do seu distrito.' });
  }
};
