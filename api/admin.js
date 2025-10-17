// api/admin.js
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }

    const url = new URL(req.url, 'http://x');
    const adminKey = url.searchParams.get('key') || '';
    const body = JSON.parse(await readBody(req) || '{}');
    const { action, payload } = body || {};

    let settings = await kv.get('settings') || {};
    const admins = Array.isArray(settings.admins) ? settings.admins.map(String) : [];
    if (!admins.includes(String(adminKey))) { res.statusCode = 403; return res.end('Forbidden'); }

    if (action === 'setPayments') {
      const pm = payload || {};
      settings.paymentMethods = {
        cash: !!pm.cash,
        crypto: !!pm.crypto
      };
      await kv.set('settings', settings);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, paymentMethods: settings.paymentMethods }));
    }

    if (action === 'setProductVariants') {
      const { productId, variants } = payload || {};
      if (!productId || !Array.isArray(variants)) { res.statusCode = 400; return res.end('Bad Request'); }
      let products = await kv.get('products') || [];
      const idx = products.findIndex(p => p.id === productId);
      if (idx < 0) { res.statusCode = 404; return res.end('Product Not Found'); }
      products[idx].variants = variants.map(v => ({
        label: String(v.label || '').trim(),
        price_cash: Number(v.price_cash || 0),
        price_crypto: Number(v.price_crypto || 0),
        stock: v.stock == null ? '∞' : (String(v.stock).trim() || '∞')
      }));
      await kv.set('products', products);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, product: products[idx] }));
    }

    res.statusCode = 400;
    
    if (action === 'adjustStockByOrder') {
      const { orderId } = payload || {};
      if (!orderId) { res.statusCode = 400; return res.end('Bad Request'); }
      const { kv } = require('./_kv');
      let orders = await kv.get('orders') || [];
      const ord = orders.find(o => o.id === String(orderId));
      if (!ord) { res.statusCode = 404; return res.end('Order Not Found'); }
      let products = await kv.get('products') || [];
      for (const it of (ord.cart?.items||[])) {
        const pid = it.id;
        const lbl = (it.unit||'').trim();
        const qty = Number(it.qty||0);
        if (!pid || !qty) continue;
        const idx = products.findIndex(p=>p.id===pid);
        if (idx<0) continue;
        const pv = products[idx].variants||[];
        const vidx = pv.findIndex(v => String(v.label||'').trim() === lbl);
        if (vidx<0) continue;
        const st = String(pv[vidx].stock ?? '∞').trim();
        if (st === '∞') continue;
        let n = parseInt(st,10);
        if (Number.isFinite(n)) {
          n = Math.max(0, n - qty);
          pv[vidx].stock = String(n);
        }
        products[idx].variants = pv;
      }
      await kv.set('products', products);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, orderId }));
    }

    res.end('Unknown action');
  
  } catch (e) {
    res.statusCode = 500;
    res.end('ERR_ADMIN:' + e.message);
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
