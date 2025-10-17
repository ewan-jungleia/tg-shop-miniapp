// api/orders.js
import { kv } from './_kv.js';

export default async function handler(req, res) {
  try {
    // Sécurité basique : admin only
    const adminId = '7587681603'; // ton ID Telegram admin
    const auth = req.headers['x-admin-key'] || req.query.key;
    if (!auth || auth !== adminId) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }

    const orders = (await kv.get('orders')) || [];
    if (req.method === 'GET') {
      const limit = Number(req.query.limit || 50);
      const data = orders.slice(-limit).reverse(); // dernières commandes d’abord
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, count: data.length, orders: data }));
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (e) {
    console.error('orders.js error', e);
    res.statusCode = 500;
    res.end('Server error: ' + (e.message || e));
  }
}
