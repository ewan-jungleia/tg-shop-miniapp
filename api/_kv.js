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
  };
}
module.exports = { kv: kvImpl };
