const tg = window.Telegram?.WebApp; tg?.ready?.();

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

  const logo = document.getElementById('logo');
  const logoPh = document.getElementById('logoPh');
  const title = document.getElementById('shopTitle');
  title.textContent = state.settings.shopName || 'Boutique';
  if (state.settings.logoUrl) { logo.src = state.settings.logoUrl; logo.style.display='block'; logoPh.style.display='none'; }
  else { logo.style.display='none'; logoPh.style.display='flex'; }
  if (state.settings.bgUrl) { document.getElementById('app').style.backgroundImage = `url('${state.settings.bgUrl}')`; }

  setupTabs();
  renderCatalog(); setTimeout(window.__applyVariantsSafe,0);
  __hideBaseStockLine();
renderDescFaqContact();
  hookupCartModal();
  applyDeliveryFieldsVisibility();
  updateCartBadge();
}

/* — Tabs — */
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

/* — Desc / FAQ / Contact — */
function renderDescFaqContact() {
  document.getElementById('descText').textContent = state.settings.description || '—';
  document.getElementById('faqText').textContent = state.settings.faq || '—';
  const contact = state.settings.contactUsername ? `https://t.me/${state.settings.contactUsername}` : '#';
  document.getElementById('contactBlock').innerHTML =
    state.settings.contactUsername
      ? `Contact humain : <a href="${contact}" target="_blank">@${state.settings.contactUsername}</a>`
      : `Aucun contact défini.`;
}

/* — Catalog — */
function __hideBaseStockLine(){
  try{
    const scan=()=>document.querySelectorAll('#catalog *').forEach(el=>{
      if(!el || !el.textContent) return;
      const t=el.textContent.trim();
      if(/^Stock\s*:/i.test(t) && !/\(variante\)/i.test(t)) el.style.display='none';
    });
    scan();
    const mo=new MutationObserver(scan);
    mo.observe(document.getElementById('catalog')||document.body,{childList:true,subtree:true});
  }catch(_){}
}


function __fixQtyLabel(){
  try{
    const scan = ()=>{
      (document.querySelectorAll('#catalog *')||[]).forEach(el=>{
        if(!el || !el.textContent) return;
        const txt = el.textContent.trim();
        if(/^Qté\s*\(/i.test(txt)) { el.textContent = 'Qté'; }
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById('catalog')||document.body,{childList:true,subtree:true});
  }catch(_){}
}


function renderCatalog() {
  const root = document.getElementById('catalog');
  root.innerHTML = '';
  state.products.forEach(p=>{
    const card = document.createElement('div'); card.className='card';

    if (Array.isArray(p.media) && p.media.length){
      const gal = document.createElement('div'); gal.className='gallery';
      p.media.forEach(m => { const el = mediaEl(m); if (el) gal.appendChild(el); });
      card.appendChild(gal);
    }

    const unitInfo = p.unit ? ` (${p.unit})` : '';
    const stockVal = (p.stock===undefined ? '∞' : p.stock);
    const isUnlimited = (String(stockVal).toLowerCase().includes('illimit') || stockVal === '∞');
    const numericStock = isUnlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, parseInt(stockVal,10)||0);
    const outOfStock = !isUnlimited && numericStock<=0;

    card.innerHTML += `
      <h3>${p.name}</h3>
      <div class="row qtyRow"><div class="row">${p.description || ''}</div>
      <div class="row" style="align-items:center; gap:12px;">
        <div class="qty">
          <label>Qté</label>
          <div class="qtybox">
            <button type="button" class="minus" data-id="${p.id}">−</button>
            <input type="number" min="1" value="1" data-id="${p.id}" class="qtyInput">
            <button type="button" class="plus" data-id="${p.id}">+</button>
          </div>
        </div>
        <div class="row" style="margin-left:auto; gap:16px;">
          <div class="priceRow"><div>Prix cash : ${fmtEUR(p.price_cash)}</div></div>
          <div>${(()=>{const pm=(state.settings&&state.settings.paymentMethods)||{cash:true,crypto:true};const bits=[];if(pm.cash)bits.push("Prix cash : "+fmtEUR(p.price_cash));if(pm.crypto)bits.push("Prix crypto : "+fmtEUR(p.price_crypto));return bits.join("   ");})()}</div>
        </div>
      </div>
      <div class="row" style="font-size:12px; color:#9aa3b2;">
        ${ outOfStock ? 'Rupture de stock' : (isUnlimited ? 'Stock : illimité' : ('Stock : '+numericStock)) }
      </div>
      <button class="primary" data-add="${p.id}" ${outOfStock?'disabled':''}>${outOfStock?'Indisponible':'Ajouter au panier'}</button>
    `;
    root.appendChild(card);
    /* VARIANT LOGIC START */
window.__applyVariantsSafe = function(){
  try{
    if(!window.state||!state.products) return;
    const cat=document.getElementById('catalog'); if(!cat) return;
    const pm=(state.settings&&state.settings.paymentMethods)||{cash:true,crypto:true};
    const fmtEUR=(n)=> (new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'})).format(Number(n||0));
    cat.querySelectorAll('.product-card').forEach(card=>{
      const p=card.__productData; if(!p||!Array.isArray(p.variants)||!p.variants.length) return;
      card.querySelectorAll('.variantList').forEach(el=>el.remove());
      const list=document.createElement('div'); list.className='variantList';
      (p.variants||[]).forEach((v,idx)=>{
        const row=document.createElement('button'); row.type='button'; row.className='variantRow';
        const label=String(v.label||'').trim();
        const pc=Number(v.price_cash||0), pr=Number(v.price_crypto||0);
        const st=(v.stock==null||String(v.stock).trim()==='')?'∞':String(v.stock).trim();
        row.dataset.label=label; row.dataset.price_cash=pc; row.dataset.price_crypto=pr; row.dataset.stock=st;
        const priceBits=[]; if(pm.cash) priceBits.push('Cash: '+fmtEUR(pc)); if(pm.crypto) priceBits.push('Crypto: '+fmtEUR(pr));
        row.innerHTML=`<span class="vLabel">${label}</span><span class="vPrices">${priceBits.join(' | ')}</span><span class="vStock">${st==='∞'?'illimité':st}</span>`;
        row.onclick=()=>{ list.querySelectorAll('.variantRow').forEach(r=>r.classList.remove('active')); row.classList.add('active');
          card.dataset.selLabel=label; card.dataset.selCash=pc; card.dataset.selCrypto=pr; card.dataset.selStock=st;
          const priceRow=card.querySelector('.priceRow'); if(priceRow){ const bits=[]; if(pm.cash) bits.push('Prix cash : '+fmtEUR(pc)); if(pm.crypto) bits.push('Prix crypto : '+fmtEUR(pr)); priceRow.textContent=bits.join('   '); }
          const sv=card.querySelector('.stockVariant'); if(sv){ sv.textContent='Stock (variante) : '+(st==='∞'?'illimité':st); }
        };
        list.appendChild(row); if(idx===0) setTimeout(()=>row.click(),0);
      });
      const qtyRow=card.querySelector('.qtyRow')||card;
      qtyRow.parentNode.insertBefore(list, qtyRow);
    });
  }catch(e){ console.error('variants safe error',e); }
};
/* VARIANT LOGIC END */


    const input = card.querySelector(`input.qtyInput[data-id="${p.id}"]`);
    const minus = card.querySelector(`button.minus[data-id="${p.id}"]`);
    const plus  = card.querySelector(`button.plus[data-id="${p.id}"]`);

    function clamp(v){
      const n = Math.max(1, parseInt(v,10)||1);
      if (isUnlimited) return n;
      return Math.min(numericStock, n);
    }
    minus.onclick = ()=>{ input.value = clamp((parseInt(input.value,10)||1)-1); };
    plus.onclick  = ()=>{ input.value = clamp((parseInt(input.value,10)||1)+1); };
    input.oninput = ()=>{ input.value = clamp(input.value); };

    const addBtn = card.querySelector(`button[data-add="${p.id}"]`);
    addBtn.onclick = ()=>{
      const qty = clamp(input.value);
      addToCart(p, qty, numericStock, isUnlimited);
      openCart('cart');
    };
  });
}

/* — Media element — */
function mediaEl(m) {
  if (m.type==='photo') { const img = document.createElement('img'); img.src=m.url; img.alt=''; return img; }
  if (m.type==='video') { const v = document.createElement('video'); v.src=m.url; v.controls=true; return v; }
  return null;
}

/* — Cart helpers — */
function addToCart(p, qty, numericStock, isUnlimited) {
  const existing = state.cart.items.find(x=>x.id===p.id);
  let newQty = qty;
  if (!isUnlimited) {
    const already = existing ? Number(existing.qty||0) : 0;
    newQty = Math.min(qty, Math.max(0, numericStock - already));
    if (newQty</span><=0) { alert('Stock insuffisant'); return; }
  }
  if (existing) existing.qty += newQty;
  else state.cart.items.push({
    id: p.id,
    name: p.name,
    unit: (card.dataset.selLabel || p.unit),
    qty: newQty,
    price_cash: Number(card.dataset.selCash ?? p.price_cash ?? 0),
    price_crypto: Number(card.dataset.selCrypto ?? p.price_crypto ?? 0)
  });
  persistCart();
  renderCartItems();
  updateCartBadge();
}

function persistCart(){ localStorage.setItem('cart', JSON.stringify(state.cart)); }

function sumCart() {
  let cash=0, crypto=0, count=0;
  for (const it of state.cart.items) {
    cash   += Number(it.qty||0) * Number(it.price_cash||0);
    crypto += Number(it.qty||0) * Number(it.price_crypto||0);
    count  += Number(it.qty||0);
  }
  return { cash, crypto, count };
}

function renderCartItems() {
  const root = document.getElementById('cartItems');
  root.innerHTML = '';
  state.cart.items.forEach(it=>{
    const row = document.createElement('div'); row.className='row cart-item';
    row.innerHTML = `<div class="cart-text">${it.name} x ${it.qty} (${it.unit||'1u'}) — Prix cash : ${fmtEUR(it.price_cash)} / Prix crypto : ${fmtEUR(it.price_crypto)}</div>`;
    const del = document.createElement('button'); del.textContent='Supprimer'; del.onclick=()=>{
      state.cart.items = state.cart.items.filter(x=>x.id!==it.id); persistCart(); renderCartItems(); updateCartBadge();
    };
    row.appendChild(del);
    root.appendChild(row);
  });

  const totals = sumCart();
  const totalRow = document.createElement('div'); totalRow.className='row cart-item';
  totalRow.innerHTML = `<div class="cart-text"><b>Total:</b> ${fmtEUR(totals.cash)} (cash) • ${fmtEUR(totals.crypto)} (crypto)</div>`;
  root.appendChild(totalRow);
}

/* — Modal / Checkout — */
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
    if (state.checkoutStep === 'cart') { cartStep.style.display = ''; deliveryStep.style.display = 'none'; }
    else { cartStep.style.display = 'none'; deliveryStep.style.display = ''; }
  }

  renderCartItems();
  updateCheckoutView();

  const pm = (state.settings.paymentMethods)||{cash:true,crypto:true};
  const cashLabel = document.querySelector('label.payment-option input[value="cash"]').closest('.payment-option');
  const cryptoLabel = document.querySelector('label.payment-option input[value="crypto"]').closest('.payment-option');
  if (!pm.cash && cashLabel) cashLabel.style.display = 'none';
  if (!pm.crypto && cryptoLabel) cryptoLabel.style.display = 'none';
  if (!pm.cash && pm.crypto) document.querySelector('input[name="pay"][value="crypto"]').checked = true;
  if (!pm.crypto && pm.cash) document.querySelector('input[name="pay"][value="cash"]').checked = true;

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
    const user = tg?.initDataUnsafe?.user ? { id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username || '' } : {};

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
        `▶️ Contactez : <a href="${data.contact_link}" target="_blank">${data.contact_link}</a>`,
        `et envoyez votre numéro de commande : <b>${data.order_id}</b>.`
      ].join('<br>');
      state.cart.items = []; persistCart(); renderCartItems(); updateCartBadge();
    } else {
      result.textContent = 'Commande envoyée (vérifie Telegram).';
    }
  };
}

/* — Open cart helper — */
function openCart(step='cart') {
  state.checkoutStep = step;
  const modal = document.getElementById('cartModal');
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open','');
  const cartStep = document.getElementById('cartStep');
  const deliveryStep = document.getElementById('deliveryStep');
  if (state.checkoutStep === 'cart') { cartStep.style.display = ''; deliveryStep.style.display = 'none'; }
  else { cartStep.style.display = 'none'; deliveryStep.style.display = ''; }
}

/* — Toggle fields by settings — */
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

/* — Badge panier — */
function updateCartBadge(){
  const btn = document.getElementById('openCart');
  if (!btn) return;
  const { count } = sumCart();
  if (count>0) btn.setAttribute('data-count', String(count));
  else btn.removeAttribute('data-count');
}

/* — Utils — */
function fmtEUR(n){ return new Intl.NumberFormat('fr-FR',{style:'currency', currency:'EUR'}).format(Number(n||0)); }

window.addEventListener('load', ()=> setTimeout(updateCartBadge, 200));
document.addEventListener('visibilitychange', ()=> setTimeout(updateCartBadge, 200));

function renderVariantTable(product){
  try{
    const wrap=document.querySelector('.variant-table');
    if(!wrap) return;
    const vars = product.variants||[];
    let html='<table><thead><tr><th>Variante</th>';
    const pm = (window.state?.settings?.paymentMethods)||{cash:true,crypto:true};
    if(pm.cash) html+='<th>Cash</th>';
    if(pm.crypto) html+='<th>Crypto</th>';
    html+='<th>Stock</th></tr></thead><tbody>';
    vars.forEach(v=>{
      html+='<tr><td>'+v.label+'</td>';
      if(pm.cash) html+='<td>'+v.price_cash+' €</td>';
      if(pm.crypto) html+='<td>'+v.price_crypto+' €</td>';
      html+='<td>'+(v.stock||'∞')+'</td></tr>';
    });
    html+='</tbody></table>';
    wrap.innerHTML=html;
  }catch(e){console.error('variantTable',e);}
}

function applyPaymentVisibility(){
  try{
    const pm=(state.settings&&state.settings.paymentMethods)||{cash:true,crypto:true};
    const cash=document.querySelector('label.payment-option input[value="cash"]')?.closest('label');
    const crypto=document.querySelector('label.payment-option input[value="crypto"]')?.closest('label');
    if(cash)   cash.style.display   = pm.cash   ? '' : 'none';
    if(crypto) crypto.style.display = pm.crypto ? '' : 'none';
    const firstOn = pm.cash ? 'cash' : (pm.crypto ? 'crypto' : null);
    if(firstOn){
      const rb=document.querySelector('input[name="pay"][value="'+firstOn+'"]');
      if(rb) rb.checked=true;
    }
  }catch(_){}
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',applyPaymentVisibility):applyPaymentVisibility();
