const { loadConfig, json } = require('./_shared');

exports.handler = async () => {
  const { pix, capacity, ...pub } = loadConfig();   // o limite de vagas não é público
  return json(200, { ...pub, pixKey: pix.key, pixHolder: pix.holder }, { 'Cache-Control': 'public, max-age=60' });
};
