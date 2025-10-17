// api/bot.js — minimal safe webhook (no 500), logs + stores last update
const { kv } = require('./_kv');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.statusCode = 200; return res.end('OK'); }

    let body = '';
    await new Promise((resolve) => {
      req.on('data', c => body += c);
      req.on('end', resolve);
    });

    let update = {};
    try { update = JSON.parse(body || '{}'); } catch(_) {}

    // Log server-side (visible dans Vercel logs) + snapshot KV (best-effort)
    try { console.log('bot webhook update:', JSON.stringify(update).slice(0, 2000)); } catch(_){}
    try { await kv.set('last_update_debug', { ts: Date.now(), update }); } catch(_){}

    res.statusCode = 200;
    res.end('OK');
  } catch (e) {
    try { console.error('bot minimal error:', e && (e.stack || e.message || e)); } catch(_){}
    res.statusCode = 200;
    res.end('OK');
  }
};
