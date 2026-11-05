const { loadConfig, json, sb } = require('./_shared');

// Aviso público "as vagas estão acabando": vale quando faltam `warnRemaining` pessoas CONFIRMADAS para o total.
// Só devolve se deve avisar; o total e a contagem aparecem apenas no painel.
exports.handler = async () => {
  try {
    const cap = loadConfig().capacity || {};
    if (!cap.total) return json(200, { warn: false }, { 'Cache-Control': 'public, max-age=20' });
    const r = await sb('registrations?select=participants&status=eq.confirmada');
    if (!r.ok) throw new Error('db');
    const taken = r.data.reduce((s, x) => s + x.participants.length, 0);
    return json(200, { warn: cap.total - taken <= (cap.warnRemaining || 50) }, { 'Cache-Control': 'public, max-age=20' });
  } catch (e) {
    console.error('vagas:', e.message);
    return json(500, { error: 'Não foi possível consultar as vagas.' });
  }
};
