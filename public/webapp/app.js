const tg=window.Telegram?.WebApp;tg?.ready?.();

const state={settings:null,products:[],cart:JSON.parse(localStorage.getItem('cart')||'{"items":[]}'),checkoutStep:'cart'};

init();

async function init(){
  try{
    const r=await fetch('/api/products'); const j=await r.json();
    state.settings=j.settings||{}; state.products=Array.isArray(j.products)?j.products:[];
    const logo=document.getElementById('logo'); const logoPh=document.getElementById('logoPh'); const title=document.getElementById('shopTitle');
    title.textContent=state.settings.shopName||'Boutique';
    if(state.settings.logoUrl){logo.src=state.settings.logoUrl; logo.style.display='block'; logoPh.style.display='none';}
    else{logo.style.display='none'; logoPh.style.display='flex';}
    if(state.settings.bgUrl){document.getElementById('app').style.backgroundImage=`url('${state.settings.bgUrl}')`;}
    setupTabs(); renderCatalog(); renderDescFaqContact(); hookupCartModal(); applyDeliveryFieldsVisibility();
  }catch(e){ try{document.body.innerHTML='<pre style="padding:16px">'+(e&&e.message||e)+'</pre>';}catch(_){} }
}

function setupTabs(){
  document.querySelectorAll('.tabs button').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });
}

function renderDescFaqContact(){
  document.getElementById('descText').textContent=state.settings.description||'—';
  document.getElementById('faqText').textContent=state.settings.faq||'—';
  const u=state.settings.contactUsername?('https://t.me/'+state.settings.contactUsername):'#';
  document.getElementById('contactBlock').innerHTML = state.settings.contactUsername
    ? 'Contact humain : <a href="'+u+'" target="_blank">@'+state.settings.contactUsername+'</a>'
    : 'Aucun contact défini.';
}

function renderCatalog(){
  const root=document.getElementById('catalog'); root.innerHTML='';
  (state.products||[]).forEach(p=>{
    const card=document.createElement('div'); card.className='card';
    const unitInfo=p.unit?(' ('+p.unit+')'):'';
    card.innerHTML = ''
      + '<h3>'+escapeHtml(p.name||'')+'</h3>'
      + '<div class="row">'+escapeHtml(p.description||'')+'</div>'
      + '<div class="row">'
      + '  <div class="qty"><label>Qté'+unitInfo+'</label>'
      + '    <div class="qtybox">'
      + '      <button type="button" class="minus" data-id="'+p.id+'">−</button>'
      + '      <input type="number" min="1" value="1" data-id="'+p.id+'" class="qtyInput">'
      + '      <button type="button" class="plus" data-id="'+p.id+'">+</button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="row" style="margin-left:auto;gap:16px;">'
      + '    <div>Prix cash : '+fmtEUR(p.price_cash)+'</div>'
      + '    <div>Prix crypto : '+fmtEUR(p.price_crypto)+'</div>'
      + '  </div>'
      + '</div>'
      + '<button class="primary" data-add="'+p.id+'">Ajouter au panier</button>';
    root.appendChild(card);
  });

  root.querySelectorAll('button.minus').forEach(b=>{
    b.onclick=()=>{const id=b.getAttribute('data-id'); const i=root.querySelector('input.qtyInput[data-id="'+id+'"]'); i.value=Math.max(1,(parseInt(i.value,10)||1)-1);};
  });
  root.querySelectorAll('button.plus').forEach(b=>{
    b.onclick=()=>{const id=b.getAttribute('data-id'); const i=root.querySelector('input.qtyInput[data-id="'+id+'"]'); i.value=Math.max(1,(parseInt(i.value,10)||1)+1);};
  });
  root.querySelectorAll('button[data-add]').forEach(btn=>{
    btn.onclick=()=>{const id=btn.getAttribute('data-add'); const p=(state.products||[]).find(x=>x.id===id); const i=root.querySelector('input.qtyInput[data-id="'+id+'"]'); const q=Math.max(1,parseInt(i.value,10)||1); addToCart(p,q); openCart('cart');};
  });
}

function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function addToCart(p,qty){
  if(!p) return;
  const ex=state.cart.items.find(x=>x.id===p.id);
  if(ex) ex.qty += qty; else state.cart.items.push({id:p.id,name:p.name,unit:p.unit,qty,price_cash:p.price_cash,price_crypto:p.price_crypto});
  persistCart(); renderCartItems();
}
function persistCart(){ localStorage.setItem('cart', JSON.stringify(state.cart)); }

function sumCart(){ let cash=0,crypto=0; for(const it of state.cart.items){ cash+=Number(it.qty||0)*Number(it.price_cash||0); crypto+=Number(it.qty||0)*Number(it.price_crypto||0);} return {cash,crypto}; }

function renderCartItems(){
  const root=document.getElementById('cartItems'); root.innerHTML='';
  state.cart.items.forEach(it=>{
    const row=document.createElement('div'); row.className='row cart-item';
    row.innerHTML='<div class="cart-text">'+escapeHtml(it.name)+' x '+it.qty+' ('+(it.unit||'1u')+') — Prix cash : '+fmtEUR(it.price_cash)+' / Prix crypto : '+fmtEUR(it.price_crypto)+'</div>';
    const del=document.createElement('button'); del.textContent='Supprimer'; del.onclick=()=>{ state.cart.items=state.cart.items.filter(x=>x.id!==it.id); persistCart(); renderCartItems(); };
    row.appendChild(del); root.appendChild(row);
  });
  const totals=sumCart(); const totalRow=document.createElement('div'); totalRow.className='row cart-item';
  totalRow.innerHTML='<div class="cart-text"><b>Total:</b> '+fmtEUR(totals.cash)+' (cash) • '+fmtEUR(totals.crypto)+' (crypto)</div>';
  root.appendChild(totalRow);
}

function hookupCartModal(){
  const modal=document.getElementById('cartModal');
  const cartStep=document.getElementById('cartStep');
  const deliveryStep=document.getElementById('deliveryStep');
  document.getElementById('openCart').onclick=()=>openCart('cart');
  document.getElementById('closeCart').onclick=()=>modal.close();
  document.getElementById('goCheckout').onclick=()=>{ if(!state.cart.items.length){ alert('Panier vide'); return; } state.checkoutStep='delivery'; updateCheckoutView(); };
  document.getElementById('backToCart').onclick=()=>{ state.checkoutStep='cart'; updateCheckoutView(); };

  function updateCheckoutView(){ if(state.checkoutStep==='cart'){ cartStep.style.display=''; deliveryStep.style.display='none'; } else { cartStep.style.display='none'; deliveryStep.style.display=''; } }
  renderCartItems(); updateCheckoutView();

  document.getElementById('placeOrder').onclick=async ()=>{
    if(!state.cart.items.length){ alert('Panier vide'); return; }
    const f=(state.settings.deliveryForm?.fields)||{};
    const firstname=document.getElementById('firstname')?.value.trim()||'';
    const lastname =document.getElementById('lastname')?.value.trim()||'';
    const address1 =document.getElementById('address1')?.value.trim()||'';
    const postalCode=document.getElementById('postalCode')?.value.trim()||'';
    const city=document.getElementById('city')?.value.trim()||'';
    const country=document.getElementById('country')?.value.trim()||'';
    if((f.firstname&&!firstname)||(f.lastname&&!lastname)||(f.address1&&!address1)||(f.postalCode&&!postalCode)||(f.city&&!city)||(f.country&&!country)){ alert('Formulaire incomplet.'); return; }
    if(f.postalCode&&(postalCode.length<3||postalCode.length>10)){ alert('Code postal invalide.'); return; }
    const payment=document.querySelector('input[name="pay"]:checked').value;
    const user=tg?.initDataUnsafe?.user?{id:tg.initDataUnsafe.user.id,username:tg.initDataUnsafe.user.username||''}:{};
    const resp=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,cart:state.cart,payment,delivery:{firstname,lastname,address1,postalCode,city,country}})});
    const data=await resp.json().catch(()=>({}));
    const result=document.getElementById('result');
    if(data?.contact_link && data?.order_id){
      const totals=sumCart();
      result.innerHTML=['✅ <b>Votre commande '+data.order_id+' a été validée !</b>','Total: '+fmtEUR(totals.cash)+' (cash) • '+fmtEUR(totals.crypto)+' (crypto)','', '▶️ Contactez : <a href="'+data.contact_link+'" target="_blank">'+data.contact_link+'</a>', 'et envoyez votre numéro de commande : <b>'+data.order_id+'</b>.'].join('<br>');
      state.cart.items=[]; persistCart(); renderCartItems();
    }else{ result.textContent='Commande envoyée (vérifie Telegram).'; }
  };
}

function openCart(step='cart'){
  state.checkoutStep=step;
  const modal=document.getElementById('cartModal');
  if(typeof modal.showModal==='function') modal.showModal(); else modal.setAttribute('open','');
  const cartStep=document.getElementById('cartStep'); const deliveryStep=document.getElementById('deliveryStep');
  if(state.checkoutStep==='cart'){ cartStep.style.display=''; deliveryStep.style.display='none'; } else { cartStep.style.display='none'; deliveryStep.style.display=''; }
}

function applyDeliveryFieldsVisibility(){
  const f=(state.settings.deliveryForm?.fields)||{};
  const map={firstname:document.getElementById('firstname'),lastname:document.getElementById('lastname'),address1:document.getElementById('address1'),postalCode:document.getElementById('postalCode'),city:document.getElementById('city'),country:document.getElementById('country')};
  Object.entries(map).forEach(([k,el])=>{ if(!el) return; if(f[k]===false){ el.parentElement?.style?el.parentElement.style.display='none':el.style.display='none'; el.dataset.disabled='1'; } else { el.parentElement?.style?el.parentElement.style.display='':el.style.display=''; delete el.dataset.disabled; } });
}

function fmtEUR(n){ return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0)); };
