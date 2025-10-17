const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  try {
    if (req.method === 'HEAD') { res.statusCode = 200; return res.end(); }
    if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method Not Allowed'); }

    const defaults = {
      shopName: 'Your Store',
      description: "Bienvenue dans votre boutique.",
      faq: "Q: Livraison ?\nR: Par colis.\n\nQ: Paiement ?\nR: Cash ou crypto (redirigé vers contact humain en V1).",
      contactUsername: "TonContactHumain",
      logoUrl: "",
      bgUrl: "",
      privateMode: false,
      requiredChannel: "",
      channels: [],
      admins: [],
      paymentMethods: { cash: true, crypto: true },
      deliveryForm: { fields: { firstname:true, lastname:true, address1:true, postalCode:true, city:true, country:true } }
    };

    let settings = await kv.get('settings');
    if (!settings) { settings = defaults; await kv.set('settings', settings); }
    else {
      settings = { ...defaults, ...settings };
      settings.deliveryForm = { fields: { ...defaults.deliveryForm.fields, ...(settings.deliveryForm?.fields||{}) } };
      settings.paymentMethods = { ...defaults.paymentMethods, ...(settings.paymentMethods||{}) };
      await kv.set('settings', settings);
    }

    let products = await kv.get('products');
    if (!Array.isArray(products)) products = [];
    let changed = false;
    for (const p of products) {
      if (p && typeof p.stock === 'undefined') { p.stock = '∞'; changed = true; }
    }
    if (changed) await kv.set('products', products);

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ settings, products }));
  } catch (e) {
    res.statusCode = 500;
    res.end('ERR_PRODUCTS:' + e.message);
  }
};
