const { loadConfig, json, sb } = require('./_shared');

// Vagas ocupadas = participantes de inscrições não canceladas (pré-cadastro reserva a vaga).
exports.handler = async () => {
  try {
    const cap = loadConfig().capacity || {};
    const total = cap.total || 0;
    if (!total) return json(200, { total: 0, taken: 0, remaining: null, warnAt: 0 }, { 'Cache-Control': 'public, max-age=20' });
    const r = await sb('registrations?select=participants&status=neq.cancelada');
    if (!r.ok) throw new Error('db');
    const taken = r.data.reduce((s, x) => s + x.participants.length, 0);
    return json(200, { total, taken, remaining: Math.max(total - taken, 0), warnAt: cap.warnAt || 20 }, { 'Cache-Control': 'public, max-age=20' });
  } catch (e) {
    console.error('vagas:', e.message);
    return json(500, { error: 'Não foi possível consultar as vagas.' });
  }
};
