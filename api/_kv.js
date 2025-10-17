/**
 * KV wrapper tolérant : si @vercel/kv n'est pas dispo/configuré,
 * expose des helpers JSON pour éviter les 500 sur les lambdas.
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
async function getJSON(key, fallback = null) {
  try {
    const v = await kvImpl.get(key);
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}
async function setJSON(key, value) {
  try { await kvImpl.set(key, value); } catch (_) {}
}
module.exports = { kv: kvImpl, getJSON, setJSON };
