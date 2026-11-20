/* ================== GESTION DES STOCKS · un état par coffre ==================
   Pôle Commercial. On ne journalise pas les mouvements : chaque coffre garde son DERNIER COMPTAGE
   (quantités, date, auteur). Pour mettre à jour, on recompte le coffre et on enregistre.
   Données (S.stocks, synchronisées avec le reste du dashboard) :
     produits : [{id, nom, icone, seuil}]            catalogue commun (le seuil, facultatif, porte sur le total de tous les coffres)
     coffres  : [{id, nom, icone, delai, maj, par, items:[{pid, q}]}]   chaque coffre a SA liste de produits ; delai = jours avant « à recompter »
   Chargé par admin.html ; utilise ses globales (S, esc, $, toast, openModal, closeModal, save, sbPushNow, jlog, currentUser, rolePerso, RoxwoodGH, isRO, isMembre). */

let STK_Q = '';          // recherche (coffre ou produit)
let STK_F = 'tous';      // filtre : tous | vieux | rupture | vides
let STK_T = 'ordre';     // tri : ordre | nom | ancien
let STK_OPEN = {};       // cartes dépliées
let STK_D = null;        // brouillon du recomptage en cours
let STK_CAT = null;      // brouillon du catalogue

const STK_ICONES = ['🗄️', '📦', '🚚', '🏭', '🏪', '🛢️', '🔒', '🧰'];

function stkD() {
  S.stocks = S.stocks || {};
  S.stocks.coffres = S.stocks.coffres || [];
  S.stocks.produits = S.stocks.produits || [];
  return S.stocks;
}
function stkPeut() { return RoxwoodGH.peutEcrire() && !isMembre() && !isRO('stocks'); }
function stkGere() { return stkPeut() && ['direction', 'assistdir', 'respcom'].includes(rolePerso()); }
function stkNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
function stkId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function stkProd(pid) { return stkD().produits.find(p => p.id === pid); }
function stkCoffre(cid) { return stkD().coffres.find(c => c.id === cid); }
function stkQui() { const cu = currentUser(); return (cu && cu.user) || sessionStorage.getItem('orx_user') || ''; }
function stkSauve(msg) { if (msg) jlog(msg); save(); sbPushNow(); }
function stkNum(v) { return (+v || 0).toLocaleString('fr-FR'); }

function stkTotaux() {
  const t = {};
  stkD().coffres.forEach(c => (c.items || []).forEach(i => { t[i.pid] = (t[i.pid] || 0) + (+i.q || 0); }));
  return t;
}
function stkAge(c) { return c.maj ? Date.now() - c.maj : Infinity; }
function stkVieux(c) { return stkAge(c) > (+c.delai || 7) * 86400000; }
function stkIlYa(ms) {
  if (!isFinite(ms)) return 'jamais compté';
  const m = Math.round(ms / 60000);
  if (m < 2) return "à l'instant";
  if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const j = Math.round(h / 24);
  return 'il y a ' + j + (j > 1 ? ' jours' : ' jour');
}
function stkTotalCoffre(c) { return (c.items || []).reduce((a, i) => a + (+i.q || 0), 0); }

/* produits sous leur seuil (total de tous les coffres) */
function stkAlertes() {
  const t = stkTotaux(), out = [];
  stkD().produits.forEach(p => {
    const seuil = +p.seuil || 0, tot = t[p.id] || 0;
    if (seuil > 0 && tot < seuil) out.push({ p, tot, seuil, rupture: tot === 0 });
  });
  return out;
}

/* ---------- page ---------- */
function stocks() {
  const D = stkD(), q = stkNorm(STK_Q), peut = stkPeut(), gere = stkGere();
  const tot = stkTotaux();
  const nbVieux = D.coffres.filter(stkVieux).length;
  const nbRupt = D.coffres.filter(c => (c.items || []).some(i => (+i.q || 0) === 0)).length;
  const nbVides = D.coffres.filter(c => !(c.items || []).length).length;
  const alertes = stkAlertes();
  const totalUnites = Object.values(tot).reduce((a, b) => a + b, 0);

  // produits qui correspondent à la recherche
  const prodsTrouves = q ? D.produits.filter(p => stkNorm(p.nom).includes(q)) : [];
  const trouveDans = c => q && ((stkNorm(c.nom).includes(q)) || (c.items || []).some(i => { const p = stkProd(i.pid); return p && stkNorm(p.nom).includes(q); }));

  let liste = D.coffres.slice();
  if (STK_F === 'vieux') liste = liste.filter(stkVieux);
  if (STK_F === 'rupture') liste = liste.filter(c => (c.items || []).some(i => (+i.q || 0) === 0));
  if (STK_F === 'vides') liste = liste.filter(c => !(c.items || []).length);
  if (STK_T === 'nom') liste.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
  if (STK_T === 'ancien') liste.sort((a, b) => (a.maj || 0) - (b.maj || 0));

  const pill = (k, l, n) => `<button class="st-pill ${STK_F === k ? 'on' : ''}" onclick="stkFiltre('${k}')">${l}${n !== null ? ' (' + n + ')' : ''}</button>`;

  const trouve = prodsTrouves.length ? prodsTrouves.slice(0, 3).map(p => {
    const ou = D.coffres.map(c => ({ c, it: (c.items || []).find(i => i.pid === p.id) })).filter(x => x.it);
    const seuil = +p.seuil || 0, t = tot[p.id] || 0;
    return `<div class="st-found">🔎 <b>${esc((p.icone || '') + ' ' + p.nom)}</b> ${ou.length
      ? `se trouve dans <b>${ou.length} coffre${ou.length > 1 ? 's' : ''}</b> sur ${D.coffres.length} : ${ou.map(x => `${esc(x.c.nom)} (${stkNum(x.it.q)})`).join(' · ')} — <b>total ${stkNum(t)}</b>`
      : "n'est dans aucun coffre"}${seuil ? ` · seuil d'alerte ${stkNum(seuil)} ${t < seuil ? '<span class="st-chip ko">Bas</span>' : '<span class="st-chip ok">OK</span>'}` : ''}</div>`;
  }).join('') : '';

  const carte = c => {
    const items = c.items || [], ouvert = !!STK_OPEN[c.id], vieux = stkVieux(c);
    const dim = q && !trouveDans(c);
    const visibles = ouvert ? items : items.slice(0, 4);
    const lignes = visibles.map(i => {
      const p = stkProd(i.pid); if (!p) return '';
      const nom = esc((p.icone ? p.icone + ' ' : '') + p.nom);
      const hl = q && stkNorm(p.nom).includes(q) ? ' class="st-hl"' : '';
      return `<div class="st-ln"><span${hl}>${nom}</span><b${(+i.q || 0) === 0 ? ' class="st-z"' : ''}>${stkNum(i.q)}</b></div>`;
    }).join('');
    const reste = items.length - 4;
    return `<div class="st-cf${dim ? ' dim' : ''}">
      <h4><span>${esc(c.icone || '🗄️')} ${esc(c.nom)}</span><span class="st-chip ${vieux ? 'ko' : 'ok'}">${vieux ? 'à recompter' : 'à jour'}</span></h4>
      <div class="st-fr${vieux ? ' vieux' : ''}">${c.maj ? 'Compté ' + stkIlYa(stkAge(c)) + (c.par ? ' · ' + esc(c.par) : '') : 'Jamais compté'}</div>
      ${lignes || '<div class="st-vide">Vide</div>'}
      ${reste > 0 ? `<div class="st-more" onclick="stkPlie('${c.id}')">${ouvert ? 'Réduire ▲' : '+ ' + reste + ' autre' + (reste > 1 ? 's' : '') + ' produit' + (reste > 1 ? 's' : '') + ' ⌄'}</div>` : ''}
      <div class="st-tot"><span>Total</span><span>${stkNum(stkTotalCoffre(c))}</span></div>
      <div class="st-act">${peut ? `<button class="btn btn-gold btn-sm" onclick="stkRecompter('${c.id}')">✏️ Recompter</button>` : ''}${gere ? `<button class="btn btn-ghost btn-sm" onclick="stkEditCoffre('${c.id}')" title="Renommer, déplacer, supprimer">⚙️</button>` : ''}</div>
    </div>`;
  };

  $('#main').innerHTML = `
  <div class="topbar">
    <div><h2>📦 Gestion des stocks</h2><div class="sub">${D.coffres.length} coffre${D.coffres.length > 1 ? 's' : ''} · ${stkNum(totalUnites)} unité${totalUnites > 1 ? 's' : ''}${nbVieux ? ' · ' + nbVieux + ' à recompter' : ''}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${gere ? `<button class="btn btn-ghost" onclick="stkCatalogue()">🏷️ Produits</button><button class="btn btn-ghost" onclick="stkEditCoffre(null)">＋ Nouveau coffre</button>` : ''}
      ${peut && D.coffres.length ? `<button class="btn btn-gold" onclick="stkRecompter()">✏️ Recompter</button>` : ''}
    </div>
  </div>
  ${!peut ? '<div class="st-warn" style="border-color:var(--line);background:var(--panel-2);color:var(--muted)">👁 Lecture seule : tu peux consulter les stocks mais pas les modifier.</div>' : ''}
  ${alertes.length ? `<div class="st-warn">⚠️ ${alertes.map(a => `<b>${esc(a.p.nom)}</b> ${a.rupture ? 'en rupture' : stkNum(a.tot) + ' / seuil ' + stkNum(a.seuil)}`).join(' · ')}</div>` : ''}
  ${D.coffres.length ? `
  <div class="st-bar">
    <input class="field st-srch" id="stkQ" placeholder="🔍 Chercher un coffre ou un produit…" value="${esc(STK_Q)}" oninput="stkRecherche(this.value)">
    ${pill('tous', 'Tous', D.coffres.length)}${pill('vieux', 'À recompter', nbVieux)}${pill('rupture', 'Avec rupture', nbRupt)}${pill('vides', 'Vides', nbVides)}
    <select class="field st-tri" onchange="STK_T=this.value;stocks()"><option value="ordre" ${STK_T === 'ordre' ? 'selected' : ''}>Tri : ordre</option><option value="nom" ${STK_T === 'nom' ? 'selected' : ''}>Tri : nom</option><option value="ancien" ${STK_T === 'ancien' ? 'selected' : ''}>Tri : plus ancien d'abord</option></select>
  </div>
  <div id="stkTrouve">${trouve}</div>
  <div class="st-grid" id="stkGrille">${liste.map(carte).join('') || '<div class="empty" style="grid-column:1/-1;padding:24px">Aucun coffre ne correspond à ce filtre.</div>'}</div>`
  : `<div class="empty" style="padding:40px;text-align:center">Aucun coffre pour l'instant.${gere ? '<br><br><button class="btn btn-gold" onclick="stkEditCoffre(null)">＋ Créer le premier coffre</button>' : '<br>Un responsable doit d\'abord en créer.'}</div>`}`;
}
function stkFiltre(k) { STK_F = k; stocks(); }
function stkPlie(id) { STK_OPEN[id] = !STK_OPEN[id]; stocks(); }
function stkRecherche(v) {
  STK_Q = v; stocks();
  const el = document.getElementById('stkQ');           // on garde le curseur dans le champ pendant la frappe
  if (el) { el.focus(); try { el.setSelectionRange(v.length, v.length); } catch (e) { } }
}

/* ---------- recompter un coffre ---------- */
function stkRecompter(cid) {
  const D = stkD();
  if (!stkPeut()) return toast("⚠️ Lecture seule — il faut un jeton d'écriture et le droit de modifier");
  if (!D.coffres.length) return toast("Aucun coffre : crée-en un d'abord");
  const c = stkCoffre(cid || (STK_D && STK_D.cid)) || D.coffres[0];
  STK_D = { cid: c.id, mode: 'liste', items: (c.items || []).map(i => ({ pid: i.pid, q: String(i.q), avant: +i.q || 0 })), q: '' };
  stkModal();
}
function stkChoixCoffre(cid) { stkLire(); const old = STK_D; stkRecompter(cid); }
function stkLire() {          // recopie les champs du formulaire dans le brouillon
  if (!STK_D || STK_D.mode !== 'liste') return;
  STK_D.items.forEach((it, k) => { const el = document.getElementById('stkq' + k); if (el) it.q = el.value; });
}
function stkModal() {
  const D = stkD(), d = STK_D, c = stkCoffre(d.cid);
  if (!c) return closeModal();
  const sel = `<select class="field" onchange="stkChoixCoffre(this.value)" style="margin-bottom:10px">${D.coffres.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc((x.icone || '🗄️') + ' ' + x.nom)}</option>`).join('')}</select>`;
  if (d.mode === 'liste') {
    const lignes = d.items.map((it, k) => {
      const p = stkProd(it.pid); if (!p) return '';
      return `<div class="st-rl"><span>${esc((p.icone ? p.icone + ' ' : '') + p.nom)}</span>
        <span class="st-rq"><input type="number" min="0" step="1" class="field st-num" id="stkq${k}" value="${esc(it.q)}" oninput="stkEcart(${k})"><span class="st-ec" id="stke${k}"></span>
        <button class="st-x" title="Retirer ce produit du coffre" onclick="stkRetire(${k})">✕</button></span></div>`;
    }).join('');
    openModal(`<h3>✏️ Recompter un coffre</h3>${sel}
      <div class="st-sm">Dernier comptage : ${c.maj ? stkIlYa(stkAge(c)) + (c.par ? ' · ' + esc(c.par) : '') : 'jamais'}. Corrige seulement ce qui a changé.</div>
      <div class="st-rls">${lignes || '<div class="st-vide">Ce coffre est vide — ajoute un produit.</div>'}</div>
      <button class="st-add" onclick="stkAjout()">＋ Ajouter un produit à ce coffre</button>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-gold" style="flex:1" onclick="stkEnreg()">✅ Enregistrer le comptage</button><button class="btn btn-ghost" onclick="closeModal()">Annuler</button></div>`);
    d.items.forEach((it, k) => stkEcart(k));
  } else if (d.mode === 'ajout') {
    openModal(`<h3>＋ Ajouter à « ${esc(c.nom)} »</h3>
      <div class="st-sm">Produits déjà connus. Tape quelques lettres, ou crée un nouveau produit.</div>
      <input class="field" id="stkPQ" placeholder="🔍 Chercher…" value="${esc(d.q || '')}" oninput="stkPickFiltre(this.value)" autocomplete="off">
      <div id="stkPickRes" style="margin-top:8px"></div>
      <div style="margin-top:12px"><button class="btn btn-ghost" onclick="STK_D.mode='liste';stkModal()">← Retour au coffre</button></div>`);
    stkPickFiltre(d.q || '');
    setTimeout(() => { const e = document.getElementById('stkPQ'); if (e) e.focus(); }, 30);
  } else {
    openModal(`<h3>🆕 Nouveau produit</h3>
      <div class="st-sm">Il rejoint le catalogue et entre directement dans « ${esc(c.nom)} ».</div>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:10px"><div class="f-row"><label class="f-lbl">Icône</label><input class="field" id="stkNI" maxlength="4" value="📦"></div>
      <div class="f-row"><label class="f-lbl">Nom</label><input class="field" id="stkNN" maxlength="50" value="${esc(d.nouveau || '')}" placeholder="Extincteur"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="f-row"><label class="f-lbl">Seuil d'alerte (facultatif)</label><input class="field" id="stkNS" type="number" min="0" placeholder="ex. 10"></div>
      <div class="f-row"><label class="f-lbl">Quantité dans ce coffre</label><input class="field" id="stkNQ" type="number" min="0" value="0"></div></div>
      <div style="display:flex;gap:10px;margin-top:6px"><button class="btn btn-gold" style="flex:1" onclick="stkCreeProd()">Créer et ajouter au coffre</button><button class="btn btn-ghost" onclick="STK_D.mode='ajout';stkModal()">Retour</button></div>`);
  }
}
function stkEcart(k) {
  const it = STK_D.items[k], el = document.getElementById('stkq' + k), out = document.getElementById('stke' + k);
  if (!el || !out) return;
  const v = parseInt(el.value, 10), a = it.avant;
  if (it.nouveau) { out.className = 'st-ec pos'; out.textContent = 'nouveau'; return; }
  if (isNaN(v) || v === a) { out.className = 'st-ec'; out.textContent = 'avant ' + stkNum(a); return; }
  const e = v - a;
  out.className = 'st-ec ' + (e > 0 ? 'pos' : 'neg'); out.textContent = (e > 0 ? '+' : '−') + stkNum(Math.abs(e)) + ' · avant ' + stkNum(a);
}
function stkRetire(k) { stkLire(); STK_D.items.splice(k, 1); stkModal(); }
function stkAjout() { stkLire(); STK_D.mode = 'ajout'; STK_D.q = ''; stkModal(); }
function stkPickFiltre(v) {
  STK_D.q = v;
  const n = stkNorm(v), deja = new Set(STK_D.items.map(i => i.pid)), tot = stkTotaux();
  const nbCoffres = pid => stkD().coffres.filter(c => c.id !== STK_D.cid && (c.items || []).some(i => i.pid === pid)).length;
  const l = stkD().produits.filter(p => !deja.has(p.id) && (!n || stkNorm(p.nom).includes(n))).slice(0, 12);
  const exact = stkD().produits.some(p => stkNorm(p.nom) === n);
  const zone = document.getElementById('stkPickRes'); if (!zone) return;
  zone.innerHTML = l.map(p => `<div class="st-opt" onclick="stkPrend('${p.id}')"><span>${esc((p.icone ? p.icone + ' ' : '') + p.nom)}</span><span class="st-sm" style="margin:0">${nbCoffres(p.id) ? 'dans ' + nbCoffres(p.id) + ' autre' + (nbCoffres(p.id) > 1 ? 's' : '') + ' coffre' + (nbCoffres(p.id) > 1 ? 's' : '') : 'catalogue'}</span></div>`).join('')
    + (l.length === 0 ? '<div class="st-vide">Aucun produit connu ne correspond.</div>' : '')
    + (v.trim() && !exact ? `<div class="st-opt st-new" onclick="stkNouveau()">＋ Créer un nouveau produit « ${esc(v.trim())} »</div>` : '');
}
function stkPrend(pid) {
  STK_D.items.push({ pid, q: '0', avant: 0, nouveau: true });
  STK_D.mode = 'liste'; stkModal();
  setTimeout(() => { const e = document.getElementById('stkq' + (STK_D.items.length - 1)); if (e) { e.focus(); e.select(); } }, 30);
}
function stkNouveau() { STK_D.nouveau = (STK_D.q || '').trim(); STK_D.mode = 'creer'; stkModal(); }
function stkCreeProd() {
  const nom = String(($('#stkNN') || {}).value || '').trim();
  if (!nom) return toast('⚠️ Donne un nom au produit');
  const D = stkD(), n = stkNorm(nom);
  let p = D.produits.find(x => stkNorm(x.nom) === n);       // doublon (« Bidon 20L » / « Bidon 20 L ») : on reprend l'existant
  if (p) toast('ℹ️ « ' + p.nom + ' » existait déjà — repris tel quel');
  else {
    p = { id: stkId('p'), nom: nom.slice(0, 50), icone: String(($('#stkNI') || {}).value || '').trim().slice(0, 4), seuil: Math.max(0, parseInt(($('#stkNS') || {}).value, 10) || 0) };
    D.produits.push(p); jlog('Stock : produit créé « ' + p.nom + ' »');
  }
  if (STK_D.items.some(i => i.pid === p.id)) { STK_D.mode = 'liste'; return stkModal(); }
  STK_D.items.push({ pid: p.id, q: String(Math.max(0, parseInt(($('#stkNQ') || {}).value, 10) || 0)), avant: 0, nouveau: true });
  STK_D.mode = 'liste'; stkModal();
}
function stkEnreg() {
  stkLire();
  const c = stkCoffre(STK_D.cid); if (!c) return;
  const items = [];
  for (const it of STK_D.items) {
    const q = parseInt(it.q, 10);
    if (isNaN(q) || q < 0) { toast('⚠️ Une quantité est vide ou négative'); return; }
    items.push({ pid: it.pid, q });
  }
  c.items = items; c.maj = Date.now(); c.par = stkQui();
  stkSauve('Stock : coffre « ' + c.nom + ' » recompté (' + items.length + ' produit' + (items.length > 1 ? 's' : '') + ', ' + stkTotalCoffre(c) + ' unités)');
  closeModal(); stocks(); toast('✅ Coffre « ' + c.nom + ' » enregistré');
}

/* ---------- coffres (création, réglages, ordre, suppression) ---------- */
function stkEditCoffre(cid) {
  if (!stkGere()) return toast('⚠️ Réservé à la Direction et au Responsable commercial');
  const c = cid ? stkCoffre(cid) : { nom: '', icone: '🗄️', delai: 7 };
  if (cid && !c) return;
  openModal(`<h3>${cid ? '⚙️ Réglages du coffre' : '🗄️ Nouveau coffre'}</h3>
    <div style="display:grid;grid-template-columns:80px 1fr;gap:10px"><div class="f-row"><label class="f-lbl">Icône</label><input class="field" id="stkCI" maxlength="4" value="${esc(c.icone || '🗄️')}"></div>
    <div class="f-row"><label class="f-lbl">Nom du coffre</label><input class="field" id="stkCN" maxlength="40" value="${esc(c.nom)}" placeholder="Dépôt principal"></div></div>
    <div class="f-row"><label class="f-lbl">À recompter après … jours</label><input class="field" id="stkCD" type="number" min="1" max="365" value="${+c.delai || 7}"></div>
    <p class="st-sm">Au-delà de ce délai sans comptage, le coffre passe en « à recompter ».</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-gold" style="flex:1" onclick="stkSaveCoffre(${cid ? "'" + cid + "'" : 'null'})">Enregistrer</button>
    ${cid ? `<button class="btn btn-ghost" onclick="stkBouge('${cid}',-1)" title="Monter">◀</button><button class="btn btn-ghost" onclick="stkBouge('${cid}',1)" title="Descendre">▶</button><button class="btn btn-ghost" style="color:#f87171" onclick="stkSupprCoffre('${cid}')">🗑 Supprimer</button>` : ''}</div>`);
}
function stkSaveCoffre(cid) {
  const nom = String(($('#stkCN') || {}).value || '').trim();
  if (!nom) return toast('⚠️ Donne un nom au coffre');
  const D = stkD(), ch = { nom: nom.slice(0, 40), icone: String(($('#stkCI') || {}).value || '').trim().slice(0, 4) || '🗄️', delai: Math.min(365, Math.max(1, parseInt(($('#stkCD') || {}).value, 10) || 7)) };
  if (cid) { Object.assign(stkCoffre(cid), ch); stkSauve('Stock : coffre modifié « ' + nom + ' »'); }
  else { D.coffres.push(Object.assign({ id: stkId('c'), items: [], maj: 0, par: '' }, ch)); stkSauve('Stock : coffre créé « ' + nom + ' »'); }
  closeModal(); stocks();
}
function stkBouge(cid, sens) {
  const l = stkD().coffres, i = l.findIndex(c => c.id === cid), j = i + sens;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; stkSauve(); STK_T = 'ordre'; stocks(); stkEditCoffre(cid);
}
function stkSupprCoffre(cid) {
  const c = stkCoffre(cid); if (!c) return;
  if (!confirm('Supprimer le coffre « ' + c.nom + ' » et son contenu enregistré ?')) return;
  S.stocks.coffres = stkD().coffres.filter(x => x.id !== cid);
  stkSauve('Stock : coffre supprimé « ' + c.nom + ' »'); closeModal(); stocks();
}

/* ---------- catalogue des produits ---------- */
function stkCatalogue() {
  if (!stkGere()) return toast('⚠️ Réservé à la Direction et au Responsable commercial');
  STK_CAT = stkD().produits.map(p => Object.assign({}, p));
  stkCatModal();
}
function stkCatLire() {
  if (!STK_CAT) return;
  STK_CAT.forEach((p, k) => {
    const n = document.getElementById('stkcn' + k), i = document.getElementById('stkci' + k), s = document.getElementById('stkcs' + k);
    if (n) p.nom = n.value; if (i) p.icone = i.value; if (s) p.seuil = s.value;
  });
}
function stkCatModal() {
  const tot = stkTotaux();
  openModal(`<h3>🏷️ Catalogue des produits</h3>
    <div class="st-sm">Le seuil d'alerte porte sur le total de tous les coffres (laisser vide = pas d'alerte).</div>
    <div class="st-rls" style="max-height:52vh;overflow:auto">${STK_CAT.map((p, k) => `<div class="st-cat">
      <input class="field" id="stkci${k}" maxlength="4" value="${esc(p.icone || '')}" style="width:56px">
      <input class="field" id="stkcn${k}" maxlength="50" value="${esc(p.nom)}" placeholder="Nom" style="flex:1">
      <input class="field" id="stkcs${k}" type="number" min="0" value="${+p.seuil || ''}" placeholder="seuil" style="width:84px">
      <span class="st-sm" style="margin:0;width:56px;text-align:right">${stkNum(tot[p.id] || 0)}</span>
      <button class="st-x" title="Supprimer ce produit partout" onclick="stkCatSuppr(${k})">🗑</button></div>`).join('') || '<div class="st-vide">Aucun produit pour l\'instant.</div>'}</div>
    <button class="st-add" onclick="stkCatAjoute()">＋ Nouveau produit</button>
    <div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-gold" style="flex:1" onclick="stkCatSave()">Enregistrer</button><button class="btn btn-ghost" onclick="closeModal()">Annuler</button></div>`);
}
function stkCatAjoute() { stkCatLire(); STK_CAT.push({ id: stkId('p'), nom: '', icone: '📦', seuil: 0 }); stkCatModal(); }
function stkCatSuppr(k) {
  stkCatLire();
  const p = STK_CAT[k]; if (!p) return;
  if (p.nom && !confirm('Supprimer « ' + p.nom + ' » du catalogue et de tous les coffres ?')) return;
  STK_CAT.splice(k, 1); stkCatModal();
}
function stkCatSave() {
  stkCatLire();
  const vus = new Set(), l = [];
  for (const p of STK_CAT) {
    const nom = String(p.nom || '').trim();
    if (!nom) continue;
    const n = stkNorm(nom);
    if (vus.has(n)) return toast('⚠️ Deux produits portent le même nom : « ' + nom + ' »');
    vus.add(n);
    l.push({ id: p.id, nom: nom.slice(0, 50), icone: String(p.icone || '').trim().slice(0, 4), seuil: Math.max(0, parseInt(p.seuil, 10) || 0) });
  }
  const garde = new Set(l.map(p => p.id));
  const D = stkD();
  D.produits = l;
  D.coffres.forEach(c => { c.items = (c.items || []).filter(i => garde.has(i.pid)); });   // un produit supprimé quitte tous les coffres
  stkSauve('Stock : catalogue enregistré (' + l.length + ' produit' + (l.length > 1 ? 's' : '') + ')');
  STK_CAT = null; closeModal(); stocks();
}
