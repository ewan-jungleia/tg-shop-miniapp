/**
 * KV wrapper tolérant : si @vercel/kv n'est pas dispo/configuré,
 * on expose une interface no-op pour éviter un crash 500 sur les lambdas.
 */
let kvImpl = null;
try {
  kvImpl = require('@vercel/kv').kv;
} catch (_) {
  kvImpl = {
    async get() { return null; },
    async set() { /* no-op */ },
    async del() { /* no-op */ },
    async incr() { return 0; },
  };
}

// Helpers JSON sûrs
async function getJSON(key, fallback = null) {
  try {
    const v = await (kvImpl.get ? kvImpl.get(key) : null);
    return (v === undefined || v === null) ? fallback : v;
  } catch (_) {
    return fallback;
  }
}
async function setJSON(key, value) {
  try {
    if (kvImpl.set) await kvImpl.set(key, value);
  } catch (_) { /* no-op */ }
}

module.exports = { kv: kvImpl, getJSON, setJSON };
