const tg = window.Telegram?.WebApp;
tg?.ready?.();

const state = {
  settings: null,
  products: [],
  cart: JSON.parse(localStorage.getItem('cart')||'{"items":[]}'),
  checkoutStep: 'cart',
};

init();

async function init() {
  const res = await fetch('/api/products');
  const { settings, products } = await res.json();
  state.settings = settings || {};
  state.products = products || [];

  // Title & branding
  const logo = document.getElementById('logo');
  const logoPh = document.getElementById('logoPh');
  const title = document.getElementById('shopTitle');
  title.textContent = state.settings.shopName || 'Boutique';

  if (state.settings.logoUrl) { logo.src = state.settings.logoUrl; logo.style.display='block'; logoPh.style.display='none'; }
  else { logo.style.display='none'; logoPh.style.display='flex'; }

  if (state.settings.bgUrl) {
    const app = document.getElementById('app');
    app.style.backgroundImage = `url('${state.settings.bgUrl}')`;
  }

  setupTabs();
  renderCatalog();
  renderDescFaqContact();
  hookupCartModal();
  applyDeliveryFieldsVisibility();
}

/* ---------- UI de base ---------- */
function setupTabs() {
  document.querySelectorAll('.tabs button').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });
}

function renderDescFaqContact() {
  document.getElementById('descText').textContent = state.settings.description || '—';
  document.getElementById('faqText').textContent = state.settings.faq || '—';
  const contact = state.settings.contactUsername ? `https://t.me/${state.settings.contactUsername}` : '#';
  document.getElementById('contactBlock').innerHTML =
    state.settings.contactUsername
      ? `Contact humain : <a href="${contact}" target="_blank">@${state.settings.contactUsername}</a>`
      : `Aucun contact défini.`;
}

/* ---------- Helpers Variantes ---------- */
function productVariants(p){
  // S'il n'y a pas de variantes, on crée une variante "par défaut"
  if (Array.isArray(p.variants) && p.variants.length){
    return p.variants.map(v=>({
      unit: v.unit || p.unit || '1u',
      price_cash: Number(v.price_cash ?? p.price_cash ?? 0),
      price_crypto: Number(v.price_crypto ?? p.price_crypto ?? 0),
    }));
  }
  return [{
    unit: p.unit || '1u',
    price_cash: Number(p.price_cash||0),
    price_crypto: Number(p.price_crypto||0)
  }];
}

/* ---------- Catalogue ---------- */
function renderCatalog() {
  const root = document.getElementById('catalog');
  root.innerHTML = '';
  state.products.forEach(p=>{
    const card = document.createElement('div'); 
    card.className='card';
    card.dataset.pid = p.id;

    // Galerie médias (tous)
    if (Array.isArray(p.media) && p.media.length){
      const gal = document.createElement('div'); gal.className='gallery';
      p.media.forEach(m => { const el = mediaEl(m); if (el) gal.appendChild(el); });
      card.appendChild(gal);
    }

    const variants = productVariants(p);
    const varId = `variant-${p.id}`;
    const priceIdCash = `price-cash-${p.id}`;
    const priceIdCrypto = `price-crypto-${p.id}`;

    // Bloc principal
    const unitInfo = (variants[0]?.unit ? ` (${variants[0].unit})` : '');
    card.innerHTML += `
      <h3>${p.name}</h3>
      <div class="row">${p.description || ''}</div>

      <div class="row">
        <div class="qty">
          <label>Qté${unitInfo}</label>
          <div class="qtybox">
            <button type="button" class="minus" data-id="${p.id}">−</button>
            <input type="number" min="1" value="1" data-id="${p.id}" class="qtyInput">
            <button type="button" class="plus" data-id="${p.id}">+</button>
          </div>
        </div>
        <div class="row" style="margin-left:auto; gap:16px;">
          <div>Prix cash : <span id="${priceIdCash}">${fmtEUR(variants[0].price_cash)}</span></div>
          <div>Prix crypto : <span id="${priceIdCrypto}">${fmtEUR(variants[0].price_crypto)}</span></div>
        </div>
      </div>
    `;

    // Sélecteur de variante (toujours rendu, caché si 1 seule variante)
    const sel = document.createElement('select');
    sel.id = varId;
    sel.className = 'variantSelect';
    sel.style.cssText = 'margin:8px 0 6px;border-radius:8px;padding:6px;';
    sel.innerHTML = variants.map((v,i)=>
      `<option value="${i}">${v.unit} — ${fmtEUR(v.price_cash)} / ${fmtEUR(v.price_crypto)}</option>`
    ).join('');
    if (variants.length <= 1) sel.style.display = 'none';
    card.appendChild(sel);

    // Bouton ajouter
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.setAttribute('data-add', p.id);
    btn.textContent = 'Ajouter au panier';
    card.appendChild(btn);

    // +/- handlers (quantité)
    // NB: on les accroche après insertion dans le DOM
    root.appendChild(card);

    // Handlers quantité
    const minus = card.querySelector('button.minus');
    const plus  = card.querySelector('button.plus');
    const input = card.querySelector('input.qtyInput');

    minus.onclick = ()=>{ input.value = Math.max(1, (parseInt(input.value,10)||1) - 1); };
    plus.onclick  = ()=>{ input.value = Math.max(1, (parseInt(input.value,10)||1) + 1); };

    // MAJ prix quand variante change
    sel.onchange = ()=>{
      const v = variants[parseInt(sel.value,10)||0] || variants[0];
      const cash = document.getElementById(priceIdCash);
      const crypto = document.getElementById(priceIdCrypto);
      if (cash) cash.textContent = fmtEUR(v.price_cash);
      if (crypto) crypto.textContent = fmtEUR(v.price_crypto);
      // MAJ du label Qté (…) à côté
      const lbl = card.querySelector('.qty label');
      if (lbl) lbl.textContent = `Qté (${v.unit})`;
    };

    // Ajouter au panier
    btn.onclick = ()=>{
      const id = p.id;
      const qty = Math.max(1, parseInt(input.value,10) || 1);
      const variantIdx = parseInt((document.getElementById(varId)?.value)||'0', 10) || 0;
      const v = variants[variantIdx] || variants[0];
      const selected = {
        id: p.id,
        name: p.name,
        unit: v.unit || p.unit || '1u',
        price_cash: Number(v.price_cash ?? p.price_cash ?? 0),
        price_crypto: Number(v.price_crypto ?? p.price_crypto ?? 0)
      };
      addToCart(selected, qty);
      openCart('cart');
    };
  });
}

/* ---------- Helpers DOM ---------- */
function mediaEl(m) {
  if (m.type==='photo') { const img = document.createElement('img'); img.src=m.url; img.alt=''; return img; }
  if (m.type==='video') { const v = document.createElement('video'); v.src=m.url; v.controls=true; return v; }
  return null;
}

/* ---------- Panier ---------- */
function addToCart(p, qty) {
  const existing = state.cart.items.find(x=>x.id===p.id && x.unit===p.unit);
  if (existing) existing.qty += qty;
  else state.cart.items.push({ id:p.id, name:p.name, unit:p.unit, qty, price_cash:p.price_cash, price_crypto:p.price_crypto });
  persistCart();
  renderCartItems();
}

function persistCart(){ localStorage.setItem('cart', JSON.stringify(state.cart)); }

function sumCart() {
  let cash=0, crypto=0;
  for (const it of state.cart.items) {
    cash   += Number(it.qty||0) * Number(it.price_cash||0);
    crypto += Number(it.qty||0) * Number(it.price_crypto||0);
  }
  return { cash, crypto };
}

function renderCartItems() {
  const root = document.getElementById('cartItems');
  root.innerHTML = '';
  state.cart.items.forEach(it=>{
    const row = document.createElement('div'); row.className='row cart-item';
    row.innerHTML = `<div class="cart-text">${it.name} x ${it.qty} (${it.unit||'1u'}) — Prix cash : ${fmtEUR(it.price_cash)} / Prix crypto : ${fmtEUR(it.price_crypto)}</div>`;
    const del = document.createElement('button'); del.textContent='Supprimer'; del.onclick=()=>{
      state.cart.items = state.cart.items.filter(x=>!(x.id===it.id && x.unit===it.unit)); persistCart(); renderCartItems();
    };
    row.appendChild(del);
    root.appendChild(row);
  });

  // Total
  const totals = sumCart();
  const totalRow = document.createElement('div'); totalRow.className='row cart-item';
  totalRow.innerHTML = `<div class="cart-text"><b>Total:</b> ${fmtEUR(totals.cash)} (cash) • ${fmtEUR(totals.crypto)} (crypto)</div>`;
  root.appendChild(totalRow);
}

function hookupCartModal() {
  const modal = document.getElementById('cartModal');
  const cartStep = document.getElementById('cartStep');
  const deliveryStep = document.getElementById('deliveryStep');

  document.getElementById('openCart').onclick = ()=>openCart('cart');
  document.getElementById('closeCart').onclick = ()=>modal.close();
  document.getElementById('goCheckout').onclick = ()=>{
    if (!state.cart.items.length) { alert('Panier vide'); return; }
    state.checkoutStep = 'delivery'; updateCheckoutView();
  };
  document.getElementById('backToCart').onclick = ()=>{
    state.checkoutStep = 'cart'; updateCheckoutView();
  };

  function updateCheckoutView() {
    if (state.checkoutStep === 'cart') {
      cartStep.style.display = '';
      deliveryStep.style.display = 'none';
    } else {
      cartStep.style.display = 'none';
      deliveryStep.style.display = '';
    }
  }

  renderCartItems();
  updateCheckoutView();

  document.getElementById('placeOrder').onclick = async ()=>{
    if (!state.cart.items.length) { alert('Panier vide'); return; }

    const f = (state.settings.deliveryForm?.fields)||{};
    const firstname = document.getElementById('firstname')?.value.trim() || '';
    const lastname  = document.getElementById('lastname')?.value.trim()  || '';
    const address1  = document.getElementById('address1')?.value.trim()  || '';
    const postalCode= document.getElementById('postalCode')?.value.trim()|| '';
    const city      = document.getElementById('city')?.value.trim()      || '';
    const country   = document.getElementById('country')?.value.trim()   || '';

    if ((f.firstname && !firstname) || (f.lastname && !lastname) ||
        (f.address1 && !address1) || (f.postalCode && !postalCode) ||
        (f.city && !city) || (f.country && !country)) {
      alert('Formulaire incomplet. Merci de remplir les champs requis.'); return;
    }
    if (f.postalCode && (postalCode.length < 3 || postalCode.length > 10)) {
      alert('Code postal invalide.'); return;
    }

    const payment = document.querySelector('input[name="pay"]:checked').value;
    const user = tg?.initDataUnsafe?.user ? {
      id: tg.initDataUnsafe.user.id,
      username: tg.initDataUnsafe.user.username || ''
    } : {};

    const resp = await fetch('/api/order', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        user, cart: state.cart, payment,
        delivery: { firstname, lastname, address1, postalCode, city, country }
      })
    });
    const data = await resp.json().catch(()=>({}));
    const result = document.getElementById('result');
    if (data?.contact_link && data?.order_id) {
      const totals = sumCart();
      result.innerHTML = [
        `✅ <b>Votre commande ${data.order_id} a été validée !</b>`,
        `Total: ${fmtEUR(totals.cash)} (cash) • ${fmtEUR(totals.crypto)} (crypto)`,
        ``,
        `▶️ Contactez : <a href="\${data.contact_link}" target="_blank">\${data.contact_link}</a>`,
        `et envoyez votre numéro de commande : <b>\${data.order_id}</b>.`
      ].join('<br>');
      state.cart.items = []; persistCart(); renderCartItems();
    } else {
      result.textContent = 'Commande envoyée (vérifie Telegram).';
    }
  };
}

function openCart(step='cart') {
  state.checkoutStep = step;
  const modal = document.getElementById('cartModal');
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open','');
  const cartStep = document.getElementById('cartStep');
  const deliveryStep = document.getElementById('deliveryStep');
  if (state.checkoutStep === 'cart') {
    cartStep.style.display = '';
    deliveryStep.style.display = 'none';
  } else {
    cartStep.style.display = 'none';
    deliveryStep.style.display = '';
  }
}

function applyDeliveryFieldsVisibility(){
  const f = (state.settings.deliveryForm?.fields)||{};
  const map = {
    firstname: document.getElementById('firstname'),
    lastname:  document.getElementById('lastname'),
    address1:  document.getElementById('address1'),
    postalCode:document.getElementById('postalCode'),
    city:      document.getElementById('city'),
    country:   document.getElementById('country'),
  };
  Object.entries(map).forEach(([k,el])=>{
    if (!el) return;
    if (f[k] === false){ el.parentElement?.style ? el.parentElement.style.display='none' : el.style.display='none'; el.dataset.disabled='1'; }
    else { el.parentElement?.style ? el.parentElement.style.display='' : el.style.display=''; delete el.dataset.disabled; }
  });
}

/* ---------- Utils ---------- */
function fmtEUR(n){ return new Intl.NumberFormat('fr-FR',{style:'currency', currency:'EUR'}).format(Number(n||0)); }

/* -------- Lightbox & badge: repris de ta version existante -------- */
(function(){
  var lb=document.getElementById('lightbox'),
      inner=document.getElementById('lbInner'),
      x=document.getElementById('lbClose');

  function openBox(url,isVideo){
    if(!lb||!inner||!url) return;
    inner.innerHTML='';
    if(isVideo){var v=document.createElement('video');v.src=url;v.controls=true;v.autoplay=true;v.playsInline=true;inner.appendChild(v);}
    else{var i=document.createElement('img');i.src=url;inner.appendChild(i);}
    lb.classList.remove('hidden'); lb.style.display='flex';
  }
  function closeBox(){ if(!lb||!inner) return; lb.classList.add('hidden'); lb.style.display='none'; inner.innerHTML=''; }
  lb && lb.addEventListener('click', function(e){ if(e.target===lb) closeBox(); }, true);
  x && x.addEventListener('click', closeBox, true);

  function bgUrl(el){ try{var s=getComputedStyle(el).backgroundImage; var m=s&&s.match(/url\(["']?(.*?)["']?\)/i); return m?m[1]:'';}catch(e){return '';} }
  function mediaFrom(el){
    if(!el) return {url:'',vid:false};
    var i=el.closest('img'); if(i) return {url:i.currentSrc||i.src||'', vid:false};
    var v=el.closest('video'); if(v) return {url:v.currentSrc||v.src||'', vid:true};
    var cur=el, hop=0; while(cur && hop<4){ var u=bgUrl(cur); if(u) return {url:u,vid:false}; cur=cur.parentElement; hop++; }
    return {url:'',vid:false};
  }
  document.addEventListener('click', function(e){
    var inCatalog = !!(e.target.closest('#catalog')||e.target.closest('.card'));
    if(!inCatalog) return;
    var m=mediaFrom(e.target);
    if(m.url){ e.preventDefault(); e.stopPropagation(); openBox(m.url,m.vid); }
  }, true);

  var cartBtn=document.getElementById('openCart')||document.querySelector('.cartFab');
  if(!cartBtn){
    cartBtn=document.createElement('button'); cartBtn.id='openCart'; cartBtn.title='Voir le panier'; cartBtn.textContent='🛍️';
    Object.assign(cartBtn.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:9998,borderRadius:'12px',padding:'10px 12px',background:'#fff',border:'1px solid #e5e7eb'});
    document.body.appendChild(cartBtn);
  }
  function getCartRoot(){ return document.getElementById('cartOverlay')||document.getElementById('cart')||document; }
  function openCartBtn(){ var el=document.getElementById('cartOverlay'); if(el){ el.classList.remove('hidden'); } else { var c=document.getElementById('cart')||document.querySelector('[data-cart]'); if(c) try{ c.scrollIntoView({behavior:'smooth',block:'start'}) }catch(e){} } }
  if(!cartBtn._wired){ cartBtn._wired=true; cartBtn.addEventListener('click',openCartBtn,true); }

  function updateBadgeFromCart(){
    if(!cartBtn) return;
    let count = 0;
    document.querySelectorAll('#cartItems .cart-text').forEach(el=>{
      const m = el.textContent.match(/x\s*(\d+)/i);
      if(m) count += parseInt(m[1],10);
    });
    if(count>0){
      cartBtn.setAttribute('data-count', String(count));
    } else {
      cartBtn.removeAttribute('data-count');
    }
  }
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const t = (btn.textContent||btn.getAttribute('aria-label')||'').toLowerCase();
    if (t.includes('ajouter au panier') || t.includes('supprimer') || t.includes('valider ma commande') ) {
      setTimeout(updateBadgeFromCart, 150);
    }
  });
  window.addEventListener('load', ()=> setTimeout(updateBadgeFromCart, 400));
})();
