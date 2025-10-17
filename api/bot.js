process.on("uncaughtException",e=>{console.error("⚠️ Uncaught:",e?.message||e);});
process.on("unhandledRejection",e=>{console.error("⚠️ Unhandled:",e?.message||e);});
// api/bot.js
const axios = require('axios');
const { kv } = require('@vercel/kv');
// --- admin session (KV) ---
const ADMIN_SESS_PREFIX = 'admin:sess:';
// Affichage stock pour l'admin (/lister)
function fmtStockDisplay(st){
  if (st == null) return 'illimité';
  const raw = String(st).trim();
  if (!raw) return 'illimité';
  if (raw === '∞' || /^illimit/i.test(raw)) return 'illimité';
  const n = parseInt(raw,10);
  return Number.isFinite(n) ? String(n) : raw;
}


async function adminSessionGet(uid){ try{ return (await kv.get(ADMIN_SESS_PREFIX+uid)) || null; }catch(_){ return null; } }
async function adminSessionSet(uid, obj){ try{ await kv.set(ADMIN_SESS_PREFIX+uid, obj); }catch(_){ } }
async function adminSessionClear(uid){ try{ await kv.del(ADMIN_SESS_PREFIX+uid); }catch(_){ } }




function prettyErr(e){
  try{
    if (e && e.response){
      const status = e.response.status;
      let payload = e.response.data;
      if (typeof payload !== 'string') payload = JSON.stringify(payload);
      if (payload && payload.length > 1200) payload = payload.slice(0,1200) + '…';
      return 'HTTP '+status+' — '+payload;
    }
    return String(e && e.message || e);
  }catch(_){ return String(e); }
}
const { preview, apply, rollback, currentDataVersion } = require('./_patchEngine');
const PATCH_SECRET = '';
const BOT = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return axios.create({ baseURL: `https://api.telegram.org/bot${token}` });
};

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (process.env.TELEGRAM_WEBHOOK_SECRET && secretHeader && secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      res.statusCode = 401; return res.end('Unauthorized');
    }
    const update = await readJson(req);
    try { const t = update.callback_query?'callback_query':(update.message?'message':'?'); console.log('[BOT] update type=', t, 'keys=', Object.keys(update||{})); } catch(_){}
    if (update.callback_query) {
      await onCallbackQuery(update.callback_query);
    } else if (update.message) {
      await onMessage(update.message);
    }
    res.statusCode = 200; res.end('OK');
  } catch { res.statusCode = 200; res.end('OK'); }
};

async function readJson(req) {
  return new Promise((resolve) => {
    let data=''; req.on('data',c=>data+=c); req.on('end',()=>{ try{resolve(JSON.parse(data||'{}'))}catch{resolve({})} });
  });
}
function isAdmin(userId, settings) { const list=settings?.admins||[]; return list.includes(String(userId)); }
async function send(text, chat_id, inlineKb, plain=false){
  return BOT().post('/sendMessage', {
    chat_id,
    text,
    parse_mode: plain ? undefined : 'HTML',
    disable_web_page_preview: true,
    reply_markup: inlineKb ? { inline_keyboard: inlineKb } : undefined
  });
}
function userHomeKb(){
  const base=(process.env.WEBAPP_URL||''); const webappUrl=base.includes('/webapp')?base:(base.replace(/\/$/,'')+'/webapp');
  return { keyboard:[ [{text:'Description'},{text:'FAQ'}], [{text:'🛍️ Ouvrir la boutique', web_app:{url:webappUrl}}] ], resize_keyboard:true };
}

async function setWebAppMenuButton(chatId){
  const base=(process.env.WEBAPP_URL||''); const webappUrl=base.includes('/webapp')?base:(base.replace(/\/$/,'')+'/webapp');
  try{
    await BOT().post('/setChatMenuButton',{
      chat_id: chatId,
      menu_button: { type:'web_app', text:'🛍️ Ouvrir la boutique', web_app:{ url: webappUrl } }
    });
  }catch(_){}
}
async function sendHome(chatId){
  await setWebAppMenuButton(chatId);
  await BOT().post('/sendMessage',{ chat_id:chatId, text:'Bienvenue ! Choisis une option :', reply_markup: userHomeKb() });
}
async function getFileUrl(fileId){
  const r=await BOT().get('/getFile',{ params:{ file_id:fileId }});
  const path=r.data?.result?.file_path; const token=process.env.TELEGRAM_BOT_TOKEN;
  if (!path) return null; return `https://api.telegram.org/file/bot${token}/${path}`;
}

/** ===== Menus Admin ===== **/
function adminRootKb(){
  return [
    [{ text:'🛒 Produits', callback_data:'admin:cat_products' }],
    [{ text:'📝 Textes', callback_data:'admin:cat_texts' }],
    [{ text:'🎨 Branding', callback_data:'admin:cat_branding' }],
    [{ text:'🔐 Accès', callback_data:'admin:cat_access' }],
    [{ text:'📦 Formulaire', callback_data:'admin:cat_form' }],
    [{ text:'📞 Contact', callback_data:'admin:cat_contact' }],
    [{ text:'👑 Admins', callback_data:'admin:cat_admins' }],
    [{ text:'📈 Rapports', callback_data:'admin:cat_reports' }],
    [{ text:'🧩 Patchs', callback_data:'admin:cat_patches' }]
  ];
}

function adminProductsKb(){
  return [
    [{ text:'📋 Lister', callback_data:'admin:prod_list' }],
    [{ text:'➕ Ajouter', callback_data:'admin:add_product' }],
    [{ text:'✏️ Modifier', callback_data:'admin:edit_product' }],
    [{ text:'🗑️ Supprimer', callback_data:'admin:delete_product' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminTextsKb(){
  return [
    [{ text:'✏️ Description', callback_data:'admin:set_description' }],
    [{ text:'✏️ FAQ', callback_data:'admin:set_faq' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminBrandingKb(){
  return [
    [{ text:'🖼️ Logo', callback_data:'admin:set_logo' }, { text:'🖼️ Fond', callback_data:'admin:set_bg' }],
    [{ text:'♻️ Revenir au fond par défaut', callback_data:'admin:reset_bg' }],
    [{ text:'🏷️ Nom boutique', callback_data:'admin:set_name' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminAccessKb(){
  return [
    [{ text:'Rendre PUBLIC', callback_data:'admin:set_access:public' }],
    [{ text:'Rendre PRIVÉ', callback_data:'admin:set_access:private' }],
    [{ text:'Canaux privés (ajouter/supprimer)', callback_data:'admin:channels_manage' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminFormKb(fields){
  const f=fields||{};
  return [
    [{ text:`Prénom: ${f.firstname?'✅':'❌'}`, callback_data:'admin:form_toggle:firstname' }, { text:`Nom: ${f.lastname?'✅':'❌'}`, callback_data:'admin:form_toggle:lastname' }],
    [{ text:`Infos: ${f.address1?'✅':'❌'}`, callback_data:'admin:form_toggle:address1' }],
    [{ text:`CP: ${f.postalCode?'✅':'❌'}`, callback_data:'admin:form_toggle:postalCode' }, { text:`Ville: ${f.city?'✅':'❌'}`, callback_data:'admin:form_toggle:city' }],
    [{ text:`Pays: ${f.country?'✅':'❌'}`, callback_data:'admin:form_toggle:country' }],
    [{ text:'🔁 Réinitialiser', callback_data:'admin:form_reset' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminContactKb(){
  return [
    [{ text:'✏️ Contact Telegram', callback_data:'admin:set_contact' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function adminAdminsKb(){
  return [
    [{ text:'📋 Lister', callback_data:'admin:admins_list' }],
    [{ text:'➕ Ajouter', callback_data:'admin:admin_add' }, { text:'🗑️ Retirer', callback_data:'admin:admin_remove' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
}
function kbConfirm(extra=[]) {
  return [[
    { text:'✅ Valider', callback_data:'ok' },
    { text:'🔄 Revenir', callback_data:'back' },
    { text:'✖️ Annuler', callback_data:'cancel' },
    ...extra
  ]];
}
function kbMedia(){
  return [[
    { text:'➕ Ajouter d’autres médias', callback_data:'more_media' },
    { text:'🧹 Vider médias', callback_data:'clear_media' },
    { text:'➡️ Terminer', callback_data:'finish_media' }
  ],[
    { text:'✖️ Annuler', callback_data:'cancel' }
  ]];
}

/** ===== Callbacks ===== **/
async function onCallbackQuery(cbq){
  const chatId=cbq.message?.chat?.id; const userId=cbq.from?.id; const data=cbq.data||'';
  try { await BOT().post('/answerCallbackQuery',{ callback_query_id: cbq.id }); } catch (_) {}
  let settings=await kv.get('settings');
  if (!settings){ settings={admins:[String(userId)]}; await kv.set('settings', settings); }
  if (!isAdmin(userId, settings)) { await send('Accès admin requis.', chatId, null, true); return; }

  // Home inline actions\n  if (data==='home:desc'){ const st=(await kv.get('settings'))||{}; await send(st.description||'Aucune description.', chatId); return; }\n  if (data==='home:faq'){ const st=(await kv.get('settings'))||{}; await send(st.faq||'Pas de FAQ.', chatId); return; }\n\n  // Root & catégories
  if (data==='admin:root'){ await send('Panneau admin :', chatId, adminRootKb()); return; }
  if (data==='admin:cat_products'){ await send('Produits :', chatId, adminProductsKb()); return; }
  if (data==='admin:cat_texts'){ await send('Textes :', chatId, adminTextsKb()); return; }
  if (data==='admin:cat_branding'){ await send('Branding :', chatId, adminBrandingKb()); return; }
  if (data==='admin:cat_access'){ await send('Accès :', chatId, adminAccessKb()); return; }
  if (data==='admin:cat_form'){
    const fields = (settings.deliveryForm?.fields) || {};
    await send('Formulaire de livraison (activer/désactiver champs) :', chatId, adminFormKb(fields)); return;
  }
  if (data==='admin:cat_contact'){ await send('Contact :', chatId, adminContactKb()); return; }
  if (data==='admin:cat_admins'){ await send('Admins :', chatId, adminAdminsKb()); return; }

  if (data==='admin:cat_patches'){
    const sess = await adminSessionGet(userId);
    const showUp = !!(sess && sess.flow==='patch' && sess.step==='applied');
    await send('🧩 Patchs :', chatId, adminPatchesKb(showUp));
    return;
  }
  if (data==='admin:version'){ await handleVersion(chatId); return; }
  if (data==='admin:patch_wait'){
    await adminSessionSet(userId,{ flow:'patch', step:'wait_doc' });
    await send('Envoie le fichier JSON du patch (comme *Document*).', chatId, adminPatchesKb(false));
    return;
  }
  if (data==='admin:patch_history'){
    try{
      const hist = (await kv.get('patch:history')) || [];
      if (!hist.length){ await send('Aucun patch appliqué pour le moment.', chatId, adminPatchesKb(false)); return; }
      const lines = hist.slice(-10).map(h=>`• ${h.at||'-'} : ${h.from||'?'} → ${h.to||'?'} ${h.rollback?'(rollback)':''}`).join('\n');
      await send(`<b>Derniers patchs</b>\n${lines}`, chatId, adminPatchesKb(true));
    }catch(e){ await send('Erreur historique: '+(e&&e.message||e), chatId); }
    return;
  }


  if (data==='admin:cat_patches'){ await send('🧩 Patchs :', chatId, adminPatchesKb()); return; }
  if (data==='admin:version'){ await handleVersion(chatId); return; }
  if (data==='admin:upgrade'){ await handleUpgrade(chatId, userId); return; }
  if (data==='admin:patch_wait'){
    await adminSessionSet(userId,{ flow:'patch', step:'wait_doc' });
    await send('Envoie maintenant le fichier JSON du patch (comme *Document*).', chatId, adminPatchesKb());
    return;
  }


  // Rapports (menu + boutons)
  if (data==='admin:cat_reports'){ await send('📈 Rapports — choisis une période :', chatId, adminReportsKb()); return; }
  if (data.startsWith('admin:reports:range:')){
    try {
      const kind = data.split(':').pop();
      await handleReports(chatId, kind);
    } catch (e) {
      await send('Erreur rapports: ' + String(e && e.message || e), chatId);
    }
    return;
  }

  // Produits
  if (data==='admin:prod_list'){
    const products=(await kv.get('products'))||[];
    if (!products.length){ await send('Aucun produit.', chatId, adminProductsKb()); return; }
    const blocks=products.map(p=>{
      const mediaCount=(p.media||[]).length;
      return `• <b>${p.name}</b> (${p.id})\n  Unité: ${p.unit||'-'} | Cash: ${p.price_cash} € | Crypto: ${p.price_crypto} €\n  Médias: ${mediaCount}\n  Desc: ${p.description||'-'}`; | Stock: ${fmtStockDisplay(p.stock)}
    }).join('\n\n');
    await send(`<b>Produits actifs</b>\n\n${blocks}`, chatId, adminProductsKb()); return;
  }
  if (data==='admin:add_product'){
    await adminSessionSet(userId,{ flow:'add_product', step:'name', payload:{ media:[] } });
    await send('Nom du produit ?', chatId); return;
  }
  if (data==='admin:edit_product'){
    await adminSessionSet(userId,{ flow:'edit_product', step:'ask_id' });
    await send('ID ou nom du produit à modifier ?', chatId); return;
  }
  if (data.startsWith('admin:edit_field:')){
    const field = data.split(':')[2];
    const sess=await adminSessionGet(userId);
    if (!sess || sess.flow!=='edit_product' || !sess.payload?.id) return;
    if (field==='media'){
      sess.step='media'; sess.payload.newMedia=[]; await adminSessionSet(userId, sess);
      await send('Envoie des <b>photos/vidéos</b>.\nTu peux vider d’abord les médias existants avec 🧹 puis ajouter.\nQuand c’est bon : ➡️ Terminer.', chatId, kbMedia());
    } else {
      sess.step='field_val'; sess.payload.field=field; await adminSessionSet(userId, sess);
      const labelMap={name:'Nom',description:'Description',unit:'Unité',price_cash:'Prix cash (€)',price_crypto:'Prix crypto (€)',stock:'Stock (nombre ou "illimité")'};
      await send(`${labelMap[field]||field} ?`, chatId, kbConfirm());
    }
    return;
  }

  // Supprimer un produit
  if (data==='admin:delete_product'){
    await adminSessionSet(userId,{ flow:'delete_product', step:'ask', payload:{} });
    await send('ID ou nom du produit à supprimer ?', chatId); return;
  }

  // Textes
  if (data==='admin:set_description'){
    await adminSessionSet(userId,{ flow:'set_description', step:'text' });
    await send('Envoie la <b>Description</b> complète.', chatId); return;
  }
  if (data==='admin:set_faq'){
    await adminSessionSet(userId,{ flow:'set_faq', step:'text' });
    await send('Envoie la <b>FAQ</b> complète.', chatId); return;
  }

  // Branding
  if (data==='admin:set_logo'){
    await adminSessionSet(userId,{ flow:'set_logo', step:'wait_media' });
    await send('Envoie une <b>photo</b> pour le logo.', chatId); return;
  }
  if (data==='admin:set_bg'){
    await adminSessionSet(userId,{ flow:'set_bg', step:'wait_media' });
    await send('Envoie une <b>photo</b> pour le fond d’écran.', chatId); return;
  }
  if (data==='admin:reset_bg'){
    const s=(await kv.get('settings'))||{}; delete s.bgUrl; await kv.set('settings', s);
    await send('✅ Fond d’écran réinitialisé (valeur par défaut).', chatId, adminBrandingKb()); return;
  }
  if (data==='admin:set_name'){
    await adminSessionSet(userId,{ flow:'set_name', step:'ask' });
    await send('Nom de la boutique ?', chatId); return;
  }

  // Accès (public/privé + canaux)
  if (data==='admin:set_access:public' || data==='admin:set_access:private'){
    settings.privateMode = data.endsWith(':private');
    await kv.set('settings', settings);
    await send(`Mode d'accès défini: <b>${settings.privateMode ? 'Privé' : 'Public'}</b>`, chatId, adminAccessKb()); return;
  }
  if (data==='admin:channels_manage'){
    await adminSessionSet(userId,{ flow:'channels', step:'menu' });
    const list = (settings.channels||[]).join('\n• ');
    await send(`Canaux privés:\n${list? '• '+list : '(aucun)'}\n\nEnvoyer @canal pour ajouter, ou "supprimer @canal" pour retirer.`, chatId); return;
  }

  // Formulaire (toggle champs)
  if (data.startsWith('admin:form_toggle:')){
    const key = data.split(':').pop();
    settings.deliveryForm = settings.deliveryForm || { fields:{} };
    settings.deliveryForm.fields = settings.deliveryForm.fields || {};
    settings.deliveryForm.fields[key] = !settings.deliveryForm.fields[key];
    await kv.set('settings', settings);
    await send('Formulaire mis à jour :', chatId, adminFormKb(settings.deliveryForm.fields)); return;
  }
  if (data==='admin:form_reset'){
    settings.deliveryForm = { fields: { firstname:true, lastname:true, address1:true, postalCode:true, city:true, country:true } };
    await kv.set('settings', settings);
    await send('✅ Formulaire réinitialisé.', chatId, adminFormKb(settings.deliveryForm.fields)); return;
  }

  // Contact
  if (data==='admin:set_contact'){
    await adminSessionSet(userId,{ flow:'set_contact', step:'ask' });
    await send('Envoie le @username du contact (sans lien).', chatId); return;
  }

  // Admins
  if (data==='admin:admins_list'){
    const admins = (settings.admins||[]).map(id=>`• ${id}`).join('\n') || '(aucun)';
    await send(`<b>Admins</b>\n${admins}`, chatId, adminAdminsKb()); return;
  }
  if (data==='admin:admin_add'){
    await adminSessionSet(userId,{ flow:'admins', step:'add' });
    await send('Envoie l’ID numérique Telegram de l’admin à ajouter.', chatId); return;
  }
  if (data==='admin:admin_remove'){
    await adminSessionSet(userId,{ flow:'admins', step:'remove' });
    await send('Envoie l’ID numérique Telegram de l’admin à retirer.', chatId); return;
  }

  // Media helpers
  const sess=await adminSessionGet(userId);
  if (data==='more_media'){
    if (sess && (sess.flow==='add_product' || (sess.flow==='edit_product' && sess.step==='media'))) {
      await adminSessionSet(userId, {...sess, step:'media'});
      await send('Envoie d’autres <b>photos/vidéos</b>.\nQuand c’est bon : ➡️ Terminer.', chatId, kbMedia());
    }
    return;
  }
  if (data==='clear_media'){
    if (sess?.flow==='edit_product' && sess.step==='media'){
      sess.payload.clearFirst = true;
      sess.payload.newMedia = [];
      await adminSessionSet(userId, sess);
      await send('🧹 Médias existants seront vidés. Ajoute maintenant les nouveaux, puis ➡️ Terminer.', chatId, kbMedia());
    }
    return;
  }
  if (data==='finish_media'){
    if (sess?.flow==='add_product'){
      const p=sess.payload;
      const recap=[
        `• Nom: ${p.name}`,
        `• Desc: ${p.description}`,
        `• Unité: ${p.unit}`,
        `• Cash: ${p.price_cash} € | Crypto: ${p.price_crypto} €`,
        `• Médias: ${p.media?.length||0}`
      ].join('\n');
      await adminSessionSet(userId, {...sess, step:'confirm'});
      await send(`<b>Récap</b>\n${recap}`, chatId, kbConfirm());
    } else if (sess?.flow==='edit_product' && sess.step==='media'){
      const products=(await kv.get('products'))||[];
      const idx=products.findIndex(p=>p.id===sess.payload.id);
      if (idx<0){ await send('Produit introuvable.', chatId); return; }
      if (sess.payload.clearFirst) products[idx].media = [];
      products[idx].media = products[idx].media || [];
      products[idx].media.push(...(sess.payload.newMedia||[]));
      await kv.set('products', products);
      await adminSessionClear(userId);
      await send('✅ Médias du produit mis à jour.', chatId, adminProductsKb());
    }
    return;
  }

  // Confirmations génériques
  if (data==='ok'){
    if (sess?.flow==='add_product' && sess.step==='confirm'){
      const products=(await kv.get('products'))||[];
      const p=sess.payload; p.id=p.id||('p'+Math.random().toString(36).slice(2,8)); p.media=p.media||[];
      products.push(p); await kv.set('products', products);
      await adminSessionClear(userId);
      await send('✅ Produit ajouté.', chatId, adminProductsKb()); return;
    }
    if (sess?.flow==='delete_product' && sess.step==='confirm'){
      let products=(await kv.get('products'))||[]; const before=products.length;
      products=products.filter(x=>x.id!==sess.payload.id); await kv.set('products', products);
      await adminSessionClear(userId);
      await send(before===products.length?'Aucun produit supprimé.':'✅ Produit supprimé.', chatId, adminProductsKb()); return;
    }
  }
  if (data==='back'){
    if (sess?.flow==='add_product'){
      if (sess.step==='confirm'){ await adminSessionSet(userId,{...sess, step:'crypto'}); await send('Prix crypto (€) ?', chatId); }
      else if (sess.step==='crypto'){ await adminSessionSet(userId,{...sess, step:'price'}); await send('Prix cash (€) ?', chatId); }
      else if (sess.step==='price'){ await adminSessionSet(userId,{...sess, step:'unit'}); await send('Unité (ex: 1u = 100g) ?', chatId); }
      else if (sess.step==='unit'){ await adminSessionSet(userId,{...sess, step:'desc'}); await send('Description ?', chatId); }
      else if (sess.step==='desc'){ await adminSessionSet(userId,{...sess, step:'name'}); await send('Nom du produit ?', chatId); }
      return;
    }
  }
  if (data==='cancel'){ await adminSessionClear(userId); await send('✖️ Flow annulé.', chatId, adminRootKb()); return; }
}

/** ===== Messages ===== **/

async function onMessage(msg){
// ---- DIAG DOC ----
  try {
    console.log('[BOT] onMessage keys=', Object.keys(msg||{}));
    if (msg && msg.document) {
      const name = (msg.document.file_name||'inconnu');
      try { await send('📄 Doc reçu: '+name+' — traitement…', msg.chat.id); } catch(_){}
    }
  } catch(_){}

  // Rattrapage: si un ADMIN envoie un document, on traite le patch directement
  try{
    if (msg && msg.document){
      const s = (await kv.get('settings')) || {};
      if (isAdmin(msg.from?.id, s)) { await handlePatchDocument(msg); return; }
    }
  }catch(_){/* ignore */}
  // --- Raccourcis commandes ---
  if (msg && msg.document && (msg.caption||"").trim()==="/patch") { await handlePatchDocument(msg); return; }
  if (msg && msg.text && msg.text.startsWith("/rollback ")) { const v=(msg.text||"").split(" ")[1]; await handleRollback(msg.chat.id, msg.from.id, v); return; }
  if (msg && msg.text && (msg.text||"").trim()==="/version") { await handleVersion(msg.chat.id); return; }
  if (msg && msg.text && (msg.text||"").trim()==="/upgrade") { await handleUpgrade(msg.chat.id, msg.from.id); return; }

  // --- Mode 'Appliquer un patch' : accepte Document OU JSON en texte ---
  try{
    const __sessPatch = await adminSessionGet(msg.from.id);
    if (__sessPatch && __sessPatch.flow==='patch' && __sessPatch.step==='wait_doc'){
      if (msg.document){
        await handlePatchDocument(msg);
        await adminSessionClear(msg.from.id);
        return;
      }
      if (typeof msg.text==='string'){
        const t = msg.text.trim();
        if (t.startsWith('{') && t.endsWith('}')){
          try{
            const manifest = JSON.parse(t);
            const p = await preview(manifest, PATCH_SECRET);
            await send(`PREVIEW OK\n${p.summary}\nCurrent: ${p.currentVersion}\nKeys: ${p.willWriteKeys.join(', ')}`, msg.chat.id);
            const r = await apply(manifest, String(msg.from.id), PATCH_SECRET);
            await send(`Patch applied. Backup: backup:${manifest.version}`, msg.chat.id);
            await adminSessionSet(msg.from.id,{ flow:'patch', step:'applied' });
            await send('Patch appliqué. Tu peux lancer un 🚀 Upgrade si besoin.', msg.chat.id, adminPatchesKb(true));
            return;
          }catch(e){
            await send('Patch error (text): ' + (e && e.message || e), msg.chat.id);
            return;
          }
        }
      }
    }
  }catch(_){}

  // --- Flux standard ---
  const chatId=msg.chat?.id; const fromId=msg.from?.id; let text=(msg.text||'').trim();

  let settings=await kv.get('settings');
  if (!settings){
    settings = {
      shopName:'Boutique',
      description:'Bienvenue dans la boutique. Produits démo.',
      faq:'Q: Livraison ?\nR: Par colis.\n\nQ: Paiement ?\nR: Cash ou crypto (redirigé vers contact humain en V1).',
      contactUsername:'TonContactHumain',
      privateMode:false, requiredChannel:'', channels:[],
      admins:[ String(fromId) ],
      deliveryForm:{ fields:{ firstname:true, lastname:true, address1:true, postalCode:true, city:true, country:true } }
    };
    await kv.set('settings', settings);
  }

  if (['/start','FAQ','Description','🛍️ Ouvrir la boutique','Menu','/faq','/description','/menu'].includes(text)) {
    await adminSessionClear(fromId);
    if (text==='/start' || text==='🛍️ Ouvrir la boutique' || text==='Menu' || text==='/menu') { await sendHome(chatId); return; }
    if (text==='FAQ' || text==='/faq') { await send(settings.faq||'—', chatId); return; }
    if (text==='Description' || text==='/description') { await send(settings.description||'—', chatId); return; }
    return;
  }

  if (text==='/cancel'){ await adminSessionClear(fromId); await send('Flow annulé.', chatId); return; }

  if (text==='/admin'){
    if (!Array.isArray(settings.admins)||settings.admins.length===0){ settings.admins=[String(fromId)]; await kv.set('settings', settings); }
    if (!isAdmin(fromId, settings)) { await send('Accès admin requis.', chatId); return; }
    await send('Panneau admin :', chatId, adminRootKb()); return;
  }

  const sess=await adminSessionGet(fromId);
  if (sess){ await handleAdminFlowStep(msg, sess); return; }

  await sendHome(chatId);
}
async function handleAdminFlowStep(msg, sess){
  const chatId=msg.chat.id; const userId=msg.from.id;

  if (sess.flow==='add_product'){
    if (sess.step==='name' && msg.text){ sess.payload.name=msg.text.trim(); sess.step='desc'; await adminSessionSet(userId,sess); await send('Description ?', chatId); return; }
    if (sess.step==='desc' && msg.text){ sess.payload.description=msg.text.trim(); sess.step='unit'; await adminSessionSet(userId,sess); await send('Unité (ex: 1u = 100g) ?', chatId); return; }
    if (sess.step==='unit' && msg.text){ sess.payload.unit=msg.text.trim(); sess.step='price'; await adminSessionSet(userId,sess); await send('Prix cash (€) ?', chatId); return; }
    if (sess.step==='price' && msg.text){
      const n=Number(msg.text.replace(',','.')); sess.payload.price_cash=isFinite(n)?n:0;
      sess.step='crypto'; await adminSessionSet(userId,sess); await send('Prix crypto (€) ?', chatId); return;
    }
    if (sess.step==='crypto' && msg.text){
      const n=Number(msg.text.replace(',','.')); sess.payload.price_crypto=isFinite(n)?n:0;
      sess.step='media'; await adminSessionSet(userId,sess);
      await send('Envoie 1 ou plusieurs <b>photos/vidéos</b> du produit.\nQuand c’est bon : ➡️ Terminer.', chatId, kbMedia()); return;
    }
    if (sess.step==='media'){
      let added=0;
      if (msg.photo?.length){ const best=msg.photo[msg.photo.length-1]; const url=await getFileUrl(best.file_id); if (url){ (sess.payload.media ||= []).push({type:'photo', url}); added++; } }
      if (msg.video){ const url=await getFileUrl(msg.video.file_id); if (url){ (sess.payload.media ||= []).push({type:'video', url}); added++; } }
      if (added>0){ await adminSessionSet(userId, sess); await send(`Média ajouté. Total: ${sess.payload.media.length}\nTu peux en ajouter d’autres ou cliquer ➡️ Terminer.`, chatId, kbMedia()); }
      return;
    }
  }

  if (sess.flow==='edit_product'){
    const products=(await kv.get('products'))||[];
    if (sess.step==='ask_id' && msg.text){
      const q=msg.text.trim().toLowerCase();
      const found=products.find(x => x.id.toLowerCase()===q || x.name.toLowerCase()===q);
      if (!found){ await send('Introuvable. Réessaie avec ID ou nom exact.', chatId); return; }
      sess.payload={ id:found.id };
      sess.step='choose_field';
      await adminSessionSet(userId, sess);
      const kb=[
        [{text:'Nom', callback_data:'admin:edit_field:name'}, {text:'Description', callback_data:'admin:edit_field:description'}],
        [{text:'Unité', callback_data:'admin:edit_field:unit'}],
        [{text:'Prix cash', callback_data:'admin:edit_field:price_cash'}, {text:'Prix crypto', callback_data:'admin:edit_field:price_crypto'}],
        [{text:'Stock', callback_data:'admin:edit_field:stock'}],
        [{text:'Médias', callback_data:'admin:edit_field:media'}],
        [{text:'Annuler', callback_data:'cancel'}]
      ];
      await send(`Modifier <b>${found.name}</b> (${found.id}) — choisis le champ :`, chatId, kb);
      return;
    }
    if (sess.step==='field_val' && msg.text){
      const products=(await kv.get('products'))||[];
      const idx = products.findIndex(p=>p.id===sess.payload.id);
      if (idx<0){ await send('Introuvable.', chatId); return; }
      const field = sess.payload.field;
      const val = msg.text.trim();
      const p = products[idx];
      if (field==='price_cash' || field==='price_crypto'){
          p[field] = Number(val.replace(',','.'))||0;
        } else if (field==='stock'){
          const t = val.trim().toLowerCase();
          if (t==='∞' || t.includes('illimit') || t==='infinite' || t==='unlimited'){
            p.stock = '∞';
          } else {
            const n = Math.max(0, parseInt(val,10) || 0);
            p.stock = n;
          }
        } else {
          p[field] = val;
        }
      products[idx]=p; await kv.set('products', products);
      await adminSessionClear(userId); await send('✅ Produit modifié.', chatId, adminProductsKb()); return;
    }
    if (sess.step==='media'){
      let added=0;
      if (msg.photo?.length){ const best=msg.photo[msg.photo.length-1]; const url=await getFileUrl(best.file_id); if (url){ (sess.payload.newMedia ||= []).push({type:'photo', url}); added++; } }
      if (msg.video){ const url=await getFileUrl(msg.video.file_id); if (url){ (sess.payload.newMedia ||= []).push({type:'video', url}); added++; } }
      if (added>0){ await adminSessionSet(userId, sess); await send(`Média ajouté. Nouveaux en attente: ${(sess.payload.newMedia||[]).length}\nTu peux en ajouter d’autres ou ➡️ Terminer.`, chatId, kbMedia()); }
      return;
    }
  }

  if (sess.flow==='delete_product'){
    if (sess.step==='ask' && msg.text){
      const q=msg.text.trim().toLowerCase(); const products=(await kv.get('products'))||[];
      const found=products.find(x=>x.id.toLowerCase()===q || x.name.toLowerCase()===q);
      if (!found){ await send('Introuvable. Réessaie avec ID ou nom exact.', chatId); return; }
      await adminSessionSet(userId,{ flow:'delete_product', step:'confirm', payload:{ id:found.id, name:found.name } });
      await send(`Supprimer <b>${found.name}</b> (${found.id}) ?`, chatId, kbConfirm()); return;
    }
  }

  if (sess.flow==='set_description' && sess.step==='text' && msg.text){
    const settings=(await kv.get('settings'))||{}; settings.description=msg.text; await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ Description mise à jour.', chatId, adminTextsKb()); return;
  }
  if (sess.flow==='set_faq' && sess.step==='text' && msg.text){
    const settings=(await kv.get('settings'))||{}; settings.faq=msg.text; await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ FAQ mise à jour.', chatId, adminTextsKb()); return;
  }

  if (sess.flow==='set_logo' && sess.step==='wait_media'){
    if (msg.photo?.length){
      const best=msg.photo[msg.photo.length-1]; const url=await getFileUrl(best.file_id);
      if (url){ const settings=(await kv.get('settings'))||{}; settings.logoUrl=url; await kv.set('settings', settings); await adminSessionClear(userId); await send('✅ Logo mis à jour.', chatId, adminBrandingKb()); return; }
    }
    await send('Envoie une photo pour le logo.', chatId); return;
  }
  if (sess.flow==='set_bg' && sess.step==='wait_media'){
    if (msg.photo?.length){
      const best=msg.photo[msg.photo.length-1]; const url=await getFileUrl(best.file_id);
      if (url){ const settings=(await kv.get('settings'))||{}; settings.bgUrl=url; await kv.set('settings', settings); await adminSessionClear(userId); await send('✅ Fond d’écran mis à jour.', chatId, adminBrandingKb()); return; }
    }
    await send('Envoie une photo pour le fond d’écran.', chatId); return;
  }
  if (sess.flow==='set_name' && sess.step==='ask' && msg.text){
    const settings=(await kv.get('settings'))||{}; settings.shopName=msg.text.trim(); await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ Nom de la boutique mis à jour.', chatId, adminBrandingKb()); return;
  }

  if (sess.flow==='channels' && sess.step==='menu' && msg.text){
    const settings=(await kv.get('settings'))||{}; settings.channels = Array.isArray(settings.channels)?settings.channels:[];
    const t = msg.text.trim();
    if (t.toLowerCase().startsWith('supprimer ')){
      const ch = t.slice(10).trim();
      settings.channels = settings.channels.filter(c=>c!==ch);
      await kv.set('settings', settings);
      await send(`Supprimé: ${ch}\nActuels: ${settings.channels.join(', ')||'(aucun)'}`, chatId);
    } else if (t.startsWith('@')) {
      if (!settings.channels.includes(t)) settings.channels.push(t);
      await kv.set('settings', settings);
      await send(`Ajouté: ${t}\nActuels: ${settings.channels.join(', ')}`, chatId);
    } else {
      await send('Format inconnu. Envoie @canal pour ajouter, ou "supprimer @canal".', chatId);
    }
    return;
  }

  if (sess.flow==='set_contact' && sess.step==='ask' && msg.text){
    const settings=(await kv.get('settings'))||{}; settings.contactUsername=msg.text.replace(/^@/,''); await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ Contact mis à jour.', chatId, adminContactKb()); return;
  }

  if (sess.flow==='admins' && sess.step==='add' && msg.text){
    const id = String(msg.text.trim());
    const settings=(await kv.get('settings'))||{}; settings.admins = Array.isArray(settings.admins)?settings.admins:[];
    if (!settings.admins.includes(id)) settings.admins.push(id);
    await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ Admin ajouté.', chatId, adminAdminsKb()); return;
  }
  if (sess.flow==='admins' && sess.step==='remove' && msg.text){
    const id = String(msg.text.trim());
    const settings=(await kv.get('settings'))||{}; settings.admins = (settings.admins||[]).filter(x=>x!==id);
    await kv.set('settings', settings);
    await adminSessionClear(userId); await send('✅ Admin retiré.', chatId, adminAdminsKb()); return;
  }
}

/** === Rapports (menu + helpers) === **/
function adminReportsKb(){
  return [
    [{ text:'Aujourdhui', callback_data:'admin:reports:range:today' }],
    [{ text:'Semaine',    callback_data:'admin:reports:range:week'  }],
    [{ text:'Mois',       callback_data:'admin:reports:range:month' }],
    [{ text:'Annee',      callback_data:'admin:reports:range:year'  }],
    [{ text:'Retour',     callback_data:'admin:root' }]
  ];
}

function startOfToday(){
  // Calcule "minuit Europe/Paris" (epoch ms)
  const tz = 'Europe/Paris';
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const y = parseInt(parts.year,10);
  const m = parseInt(parts.month,10);
  const d = parseInt(parts.day,10);
  // construit minuit local (string sans TZ -> interprétée en local par V8, OK pour notre besoin ici)
  const localMidnight = new Date(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00`);
  return localMidnight.getTime();
}

function startOfWeek(){
  const now = new Date();
  const t0 = startOfToday();
  const dow = (new Intl.DateTimeFormat('fr-FR',{weekday:'short', timeZone:'Europe/Paris'}).format(now).toLowerCase());
  // Lundi=0 … Dimanche=6
  const map = {lun:0, mar:1, mer:2, jeu:3, ven:4, sam:5, dim:6};
  const k = Object.keys(map).find(k=>dow.startsWith(k)) || 'lun';
  const delta = map[k];
  return t0 - delta*24*3600*1000;
}
function startOfMonth(){
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'});
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p=>[p.type,p.value]));
  const y = parseInt(parts.year,10);
  const m = parseInt(parts.month,10);
  const local = new Date(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-01T00:00:00`);
  return local.getTime();
}
function startOfYear(){
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric'});
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p=>[p.type,p.value]));
  const y = parseInt(parts.year,10);
  const local = new Date(`${y.toString().padStart(4,'0')}-01-01T00:00:00`);
  return local.getTime();
}
function rangeTs(kind){
  if (kind==='today') return startOfToday();
  if (kind==='week')  return startOfWeek();
  if (kind==='month') return startOfMonth();
  if (kind==='year')  return startOfYear();
  return 0;
}
function fmtEUR(n){ return new Intl.NumberFormat('fr-FR',{style:'currency', currency:'EUR'}).format(Number(n||0)); }
function fmtDate(ts){
  try{
    return new Date(ts||Date.now()).toLocaleString('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(_){ return new Date(ts||Date.now()).toISOString(); }
}
function orderLine(o){
  const items=(o && o.cart && o.cart.items ? o.cart.items : []).map(i=>String(i.name)+' x '+String(i.qty)).join(', ') || '(vide)';
  const d=o && o.delivery ? o.delivery : {};
  const name=[d.firstname||'', d.lastname||''].filter(Boolean).join(' ').trim();
  const addr=[d.address1||'', [d.postalCode||'', d.city||''].filter(Boolean).join(' '), d.country||''].filter(Boolean).join(', ') || '-';
  const step = (o && o.status && o.status.step===2) || (o && o.validated_2of2) ? '2/2' : '1/2';
  return [
    '<b>'+o.id+'</b> • '+fmtDate(o.ts),
    'Statut: Validée '+step,
    'Produits: '+items,
    'Paiement: '+(o.payment||'-'),
    'Total: '+fmtEUR((o.totals&&o.totals.cash)||0)+' (cash) • '+fmtEUR((o.totals&&o.totals.crypto)||0)+' (crypto)',
    'Infos: '+(name?name+', ':'')+addr
  ].join('\n');
}
function aggregate(list){let cash=0, crypto=0, count=0;for(let i=0;i<list.length;i++){const o=list[i];if(!o) continue;count++;if(o.payment==="cash"){cash+=Number(o?.totals?.cash||0);}else if(o.payment==="crypto"){crypto+=Number(o?.totals?.crypto||0);}}return {cash,crypto,count};}
async function handleReports(chatId, kind){
  const labels = {today:'Aujourd’hui', week:'Semaine', month:'Mois', year:'Année'};
  const since = rangeTs(kind);
  const v2 = (await kv.get('orders_v2')) || [];
  const v1 = (await kv.get('orders')) || [];
  const seen = new Set();
  const all = [...v1, ...v2].filter(o => {
    if (!o || !o.id) return true;
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  const list = all.filter(o => Number(o.ts||0) >= since).sort((a,b)=>Number(b.ts)-Number(a.ts));

  if (!list.length){
    await send(`Aucune commande pour la période « ${labels[kind]||kind} ».`, chatId, adminReportsKb());
    return;
  }

  const agg = aggregate(list);
  const header =
    `<b>📈 Rapports — ${labels[kind]||kind}</b>\n` +
    `Total commandes: ${agg.count}\n` +
    `CA: ${fmtEUR(agg.cash)} (cash) • ${fmtEUR(agg.crypto)} (crypto)\n`;

  let msg = header + '\n' + list.map(orderLine).join('\n\n');

  const MAX = 3800;
  if (msg.length > MAX) {
    let out = header + '\n';
    for (const line of list.map(orderLine)) {
      if (out.length + line.length + 2 > MAX) break;
      out += line + '\n\n';
    }
    msg = out.trimEnd() + '\n\n…(tronqué)';
  }

  await send(msg, chatId, adminReportsKb());
}
// === end Reports block ===

// --- Patch helpers (data only) ---
async function handleVersion(chatId){
  try {
    const codeV = process.env.APP_VERSION || 'n/a';
    const dataV = await currentDataVersion();
    await send(`Code: ${codeV}\nData: ${dataV}`, chatId);
  } catch(e){ await send('Version error: '+(e&&e.message||e), chatId); }
}
async function handleRollback(chatId, adminId, target){
  try {
    const r = await rollback(target, String(adminId));
    await send(`Rollback OK → ${r.restoredTo}`, chatId);
  } catch(e){ await send('Rollback FAIL: '+(e&&e.message||e), chatId); }
}
async function handlePatchDocument(msg){
  const chatId = msg.chat.id; const userId = msg.from.id;
  try {
    const settings = (await kv.get('settings')) || {};
    if (!isAdmin(userId, settings)) { await send('Accès admin requis.', chatId); return; }

    if (!msg.document || !msg.document.file_id) {
      await send('Patch error: document manquant.', chatId);
      return;
    }

    await send('Récupération du fichier…', chatId);
    const fid = msg.document.file_id;
    const url = await getFileUrl(fid);
    if (!url) { await send('Patch error: URL de fichier introuvable.', chatId); return; }

    const buf = await axios.get(url, { responseType:'arraybuffer' }).then(r=>Buffer.from(r.data));
    let manifest;
    try { manifest = JSON.parse(buf.toString('utf8')); }
    catch(e){ await send('Patch error: JSON invalide ('+(e && e.message || e)+')', chatId); return; }

    await send('Preview en cours…', chatId);
    let p;
    try {
      p = await preview(manifest, PATCH_SECRET);
    } catch(e){
      await send('Patch error (preview): '+prettyErr(e), chatId);
      return;
    }

    await send(
      'PREVIEW OK\n'
      + (p.summary||'') + '\n'
      + 'Current: '+(p.currentVersion||'?')+'\n'
      + 'Keys: '+((p.willWriteKeys||[]).join(', ')||'(aucune)'),
      chatId
    , null, true);

    await send('Application du patch…', chatId);
    try {
      await apply(manifest, String(userId), PATCH_SECRET);
    } catch(e){
      await send('Patch error (apply): '+prettyErr(e), chatId);
      return;
    }

    try {
      const hist = (await kv.get('patch:history')) || [];
      hist.push({ at: Date.now(), from: (p && p.currentVersion)||null, to: manifest.version||null, by: String(userId) });
      await kv.set('patch:history', hist);
    } catch(_) {}

    await send('Patch applied. Backup: backup:'+String(manifest.version||'?'), chatId);
    await adminSessionSet(userId,{ flow:'patch', step:'applied' });

    if (manifest.upgrade === true) {
      const ok = await triggerUpgrade();
      await send(ok ? "Code upgrade déclenché (Vercel)" : "Upgrade non déclenché (hook absent ou erreur)", chatId);
    } else {
      await send('Tu peux lancer un Upgrade si besoin.', chatId, adminPatchesKb(true));
    }
  } catch(e){
    await send('Patch error: '+prettyErr(e), chatId);
  }
}

async function handleUpgrade(chatId, adminId){
  const settings = (await kv.get('settings')) || {};
  if (!isAdmin(adminId, settings)) { await send('Accès admin requis.', chatId); return; }
  try {
    const ok = await triggerUpgrade();
    await send(ok ? '🚀 Redeploy demandé à Vercel.' : '⚠️ VERCEL_DEPLOY_HOOK_URL manquant ou erreur.', chatId);
  } catch(e){
    await send('Upgrade error: ' + (e && e.message || e), chatId);
  }
}

async function triggerUpgrade(){
  try {
    const url = process.env.VERCEL_DEPLOY_HOOK_URL;
    if (!url || !/^https?:\/\//.test(url)) return false;
    await axios.post(url, {}); // simple ping
    return true;
  } catch(_) { return false; }
}



function adminPatchesKb(showUpgrade){
  const base = [
    [{ text:'📥 Appliquer un patch', callback_data:'admin:patch_wait' }],
    [{ text:'📜 Historique', callback_data:'admin:patch_history' }],
    [{ text:'🧾 Version', callback_data:'admin:version' }],
    [{ text:'⬅️ Retour', callback_data:'admin:root' }]
  ];
  if (showUpgrade) base.splice(2, 0, [{ text:'🚀 Upgrade', callback_data:'admin:upgrade' }]);
  return base;
}

