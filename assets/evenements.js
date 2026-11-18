/* ================== ÉVÉNEMENTS · giveaways et pronostics ==================
   Page du dashboard (admin.html) qui pilote le bot Discord :
   · le bot publie l'état dans _tables.oilroxwood_evenements (table qu'il est seul à écrire, cf. TABLES_BOT) ;
   · le site dépose des ordres dans _tables.oilroxwood_bot_ordres : gw_creer / gw_terminer / gw_relancer / gw_annuler,
     pari_grille / pari_resultat / pari_annuler / pari_reset. Le bot les exécute dans les 20 s et répond « fait » ou « erreur ».
   Chargé par admin.html ; utilise ses globales (S, SYNC, RoxwoodGH, esc, $, toast, openModal, closeModal…). */

let EVT_TAB = 'pari';
let EVT_G = null;      // brouillon de la grille en cours de saisie
let EVT_GW = null;     // brouillon du giveaway
let EVT_RES = {};      // saisie des résultats : {idMatch:{c,sa,sb}}
let EVT_BUSY = false;

const EVT_SPORTS = ['⚽', '🏀', '🏉', '🎾', '🥊', '🏐', '🏒', '🏎️', '🏈', '🎯'];
const EVT_DUREES = [['1h', 3600], ['6h', 21600], ['1 jour', 86400], ['3 jours', 259200], ['7 jours', 604800]];

function evtLigne(l) { return Object.assign({ icone: '⚽', a: '', b: '', dt: '', nul: true }, l || {}); }
function evtInit() {
  if (!EVT_G) EVT_G = { titre: '', champ: '', salon: '', score: false, lignes: [evtLigne(), evtLigne()] };
  if (!EVT_GW) EVT_GW = { lot: '', duree: 86400, perso: '', gagnants: 1, role: '', salon: '' };
}
function evtData() {
  const t = (S._tables && S._tables.oilroxwood_evenements) || {};
  return { giveaways: t.giveaways || [], matchs: t.matchs || [], classements: t.classements || [], salons: t.salons || [],
           roles: t.roles || [], maj: t.maj || 0 };
}
/* Nom prénom d'un membre : la fiche RH (lien par l'ID Discord) fait foi ; sinon le nom donné par le bot ; sinon son numéro. */
function evtNomDe(id, nomBot) {
  const rh = ((S.sheets && S.sheets.rh) || []).find(r => String(r.discord || '').trim() === String(id));
  if (rh && rh.nom) return rh.nom;
  return nomBot && !/^#\d+$/.test(nomBot) ? nomBot : (nomBot || '#' + id);
}
function evtTs(dt) { const t = new Date(dt).getTime(); return isNaN(t) ? 0 : Math.round(t / 1000); }
function evtQuand(ts) {
  return new Date(ts * 1000).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function evtDansLe(ts) {
  const s = ts - Date.now() / 1000, a = Math.abs(s), u = a >= 86400 ? Math.round(a / 86400) + ' j' : a >= 3600 ? Math.round(a / 3600) + ' h' : Math.max(1, Math.round(a / 60)) + ' min';
  return s >= 0 ? 'dans ' + u : 'il y a ' + u;
}
function evtDuree(txt) {                       // « 2j », « 5h », « 30m », « 1j 12h » -> secondes
  let tot = 0;
  String(txt || '').toLowerCase().replace(/(\d+)\s*(j|d|h|min|m)\b/g, (x, n, u) => { tot += +n * ({ j: 86400, d: 86400, h: 3600, min: 60, m: 60 }[u]); return x; });
  return tot;
}

/* ---- envoi d'un ordre au bot, puis attente de sa réponse (relecture du dépôt toutes les 6 s, comme pour l'éligibilité) ---- */
async function evtOrdre(type, payload) {
  if (EVT_BUSY) { toast("Un ordre est déjà en cours d'envoi, patiente quelques secondes"); return false; }
  if (!SYNC.cli) { toast('⚠️ Synchro non connectée — recharge la page et réessaie'); return false; }
  if (!RoxwoodGH.peutEcrire()) { toast("⚠️ Lecture seule — ajoute ton jeton d'écriture pour envoyer au bot"); return false; }
  EVT_BUSY = true;
  try {
    const cu = currentUser();
    payload = Object.assign({ par: (cu && cu.user) || sessionStorage.getItem('orx_user') || 'dashboard' }, payload);
    toast('📤 Envoi au bot…');
    const { data, error } = await SYNC.cli.from('oilroxwood_bot_ordres').insert({ type, payload }).select('id').single();
    if (error) { toast("⚠️ Échec de l'envoi : " + error.message); return false; }
    await sbPushNow();
    toast('⏳ Ordre déposé — le bot le prend dans les 20 s…', 6000);
    const id = data.id, limite = Date.now() + 180000;
    while (Date.now() < limite) {
      await new Promise(r => setTimeout(r, 6000));
      let o = null;
      try {
        const rem = (await RoxwoodGH.lireAvecSha()).data;
        o = ((rem && rem._tables && rem._tables.oilroxwood_bot_ordres) || []).find(x => x && x.id === id) || null;
      } catch (e) { continue; }
      if (!o || (o.statut || 'en_attente') === 'en_attente') continue;
      if (o.statut === 'fait') {
        toast('✅ ' + (o.rapport || 'Fait'), 7000);
        setTimeout(sbResync, 22000); setTimeout(sbResync, 50000);          // le bot republie l'état juste après
        return true;
      }
      toast('⚠️ Le bot a signalé : ' + (o.rapport || 'erreur sans détail'), 12000);
      return false;
    }
    toast("⏳ Toujours sans réponse après 3 min — le bot est sans doute éteint, il traitera l'ordre à son réveil", 9000);
    return false;
  } finally { EVT_BUSY = false; }
}

/* ---- pronostics : saisie de la grille ---- */
function evtSetG(k, v) { EVT_G[k] = v; }
function evtSetL(i, k, v) { EVT_G.lignes[i][k] = v; }
function evtAjoutL() { const d = EVT_G.lignes[EVT_G.lignes.length - 1]; EVT_G.lignes.push(evtLigne({ icone: d ? d.icone : '⚽', dt: d ? d.dt : '' })); evenements(); }
function evtSuppL(i) { EVT_G.lignes.splice(i, 1); if (!EVT_G.lignes.length) EVT_G.lignes.push(evtLigne()); evenements(); }
function evtColler() {
  openModal(`<h3 style="margin:0 0 6px">📋 Coller une liste de matchs</h3>
    <div class="fx-mut" style="margin:0 0 10px">Un match par ligne : <b>Équipe A | Équipe B | 22/11 21:00</b> (ajoute <b>| sans nul</b> si pas de match nul).</div>
    <textarea id="evtPaste" class="field" style="width:100%;min-height:180px;font-family:Consolas,monospace" placeholder="PSG | OM | 22/11 21:00&#10;Lakers | Celtics | 23/11 02:00 | sans nul"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-gold" onclick="evtColle()">Ajouter</button></div>`);
}
function evtColle() {
  const txt = (document.getElementById('evtPaste') || {}).value || '', ok = [], mal = [];
  const an = new Date().getFullYear();
  txt.split('\n').map(l => l.trim()).filter(Boolean).forEach((l, n) => {
    const p = l.split('|').map(x => x.trim());
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2})\s*[h:]\s*(\d{0,2})$/i.exec(p[2] || '');
    if (p.length < 3 || !p[0] || !p[1] || !m) { mal.push(n + 1); return; }
    const pad = x => String(x).padStart(2, '0'), aa = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : an;
    let ic = '⚽', a = p[0]; const e = /^([^\w\s]+)\s*(.+)$/u.exec(a); if (e) { ic = e[1]; a = e[2]; }
    ok.push(evtLigne({ icone: ic, a, b: p[1], dt: `${aa}-${pad(m[2])}-${pad(m[1])}T${pad(m[4])}:${pad(m[5] || 0)}`, nul: !/sans nul/i.test(p.slice(3).join(' ')) }));
  });
  if (mal.length) { toast('⚠️ Ligne(s) illisible(s) : ' + mal.join(', ') + ' — rien ajouté', 6000); return; }
  if (!ok.length) { toast('Aucun match à ajouter'); return; }
  EVT_G.lignes = EVT_G.lignes.filter(l => l.a || l.b || l.dt).concat(ok);
  closeModal(); evenements();
}
async function evtPublier() {
  const G = EVT_G;
  if (!G.salon) return toast('Choisis le salon de publication');
  const lignes = G.lignes.filter(l => l.a || l.b || l.dt);
  if (!lignes.length) return toast('Ajoute au moins un match');
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.a.trim() || !l.b.trim()) return toast(`Match ${i + 1} : il manque une équipe`);
    if (!evtTs(l.dt)) return toast(`Match ${i + 1} : choisis la date et l'heure`);
  }
  if (lignes.length > 15) return toast('15 matchs maximum par grille');
  if (!confirm(`Publier ${lignes.length} match(s) dans le salon choisi ?`)) return;
  const ok = await evtOrdre('pari_grille', {
    salon: G.salon, titre: G.titre.trim(), championnat: G.champ.trim(),
    matchs: lignes.map(l => ({ icone: l.icone, a: l.a.trim(), b: l.b.trim(), debut: evtTs(l.dt), nul: !!l.nul, score_exact: !!G.score }))
  });
  if (ok) { EVT_G.lignes = [evtLigne(), evtLigne()]; EVT_G.titre = ''; evenements(); }
}

/* ---- pronostics : résultats ---- */
function evtPick(id, c) { const r = EVT_RES[id] = EVT_RES[id] || {}; r.c = (r.c === c && !r.sa && !r.sb) ? '' : c; evenements(); }
function evtScore(id, k, v) {
  const r = EVT_RES[id] = EVT_RES[id] || {}; r[k] = v.replace(/\D/g, '').slice(0, 3);
  if (r.sa !== undefined && r.sa !== '' && r.sb !== undefined && r.sb !== '') { r.c = +r.sa > +r.sb ? 'a' : +r.sb > +r.sa ? 'b' : 'n'; evenements(); }
}
async function evtValider(id) {
  const r = EVT_RES[id] || {}, m = evtData().matchs.find(x => x.id === id);
  if (!m) return;
  const aS = r.sa !== undefined && r.sa !== '', bS = r.sb !== undefined && r.sb !== '';
  if (aS !== bS) return toast('Donne les deux scores, ou aucun');
  if (!r.c) return toast('Choisis le vainqueur (ou entre le score)');
  if (r.c === 'n' && !m.nul) return toast("Ce match n'a pas de nul");
  const ok = await evtOrdre('pari_resultat', { match: id, c: r.c, s: aS ? [+r.sa, +r.sb] : null });
  if (ok) { delete EVT_RES[id]; evenements(); }
}
async function evtAnnulerMatch(id) {
  if (!confirm('Supprimer ce match (et retirer les points déjà donnés) ?')) return;
  await evtOrdre('pari_annuler', { match: id });
}
async function evtResetChamp(titre) {
  if (!confirm(`Remettre le championnat « ${titre} » à zéro ? Tous ses points seront effacés.`)) return;
  await evtOrdre('pari_reset', { championnat: titre });
}

/* ---- giveaways ---- */
function evtSetGW(k, v) { EVT_GW[k] = v; }
async function evtLancerGW() {
  const g = EVT_GW, sec = g.duree === 'perso' ? evtDuree(g.perso) : +g.duree;
  if (!g.lot.trim()) return toast('Indique le lot à gagner');
  if (!g.salon) return toast('Choisis le salon de publication');
  if (!sec || sec < 60) return toast('Durée illisible (exemples : 2j, 5h, 30m)');
  const ok = await evtOrdre('gw_creer', { salon: g.salon, lot: g.lot.trim(), duree_s: sec, gagnants: Math.max(1, Math.min(20, +g.gagnants || 1)), role: g.role });
  if (ok) { EVT_GW.lot = ''; evenements(); }
}
async function evtGW(type, id, msg) {
  if (msg && !confirm(msg)) return;
  await evtOrdre(type, { id });
}

/* ---- la page ---- */
function evtOpts(liste, courant, vide) {
  return (vide ? `<option value="">${esc(vide)}</option>` : '') + liste.map(x => `<option value="${esc(x.id)}" ${String(courant) === String(x.id) ? 'selected' : ''} ${x.ok === false ? 'disabled' : ''}>${x.ok === false ? '🔒 ' : ''}${esc(x.cat ? x.cat + ' › ' + x.nom : x.nom)}${x.ok === false ? " — le bot n'a pas accès" : ''}</option>`).join('');
}
/* Choix du salon : un champ où l'on tape pour chercher (nom du salon ou de sa catégorie), les résultats s'affichent dessous. */
let EVT_SALONS = [];
function evtNorm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function evtSalonSel(D, cle, courant, fn) {
  if (!D.salons.length) return `<input class="field" placeholder="ID du salon (le bot n'a pas encore envoyé sa liste)" value="${esc(courant)}" oninput="${fn}('${cle}',this.value)">`;
  EVT_SALONS = D.salons;
  const cur = D.salons.find(x => String(x.id) === String(courant));
  return `<div class="ev-combo"><input class="field" autocomplete="off" data-fn="${fn}" data-cle="${cle}" placeholder="🔍 Rechercher un salon…" value="${cur ? '#' + esc(cur.nom) : ''}"
      onfocus="this.select();evtComboMontre(this)" oninput="evtComboMontre(this)" onblur="setTimeout(()=>evtComboCache(this),180)"><div class="ev-combo-l" hidden></div></div>`;
}
function evtComboMontre(inp) {
  const box = inp.nextElementSibling, q = evtNorm(inp.value.replace(/^#/, ''));
  const ok = EVT_SALONS.filter(x => !q || evtNorm(x.nom).includes(q) || evtNorm(x.cat).includes(q));
  const vus = ok.slice(0, 60);
  box.innerHTML = vus.length
    ? vus.map(x => `<div class="ev-co ${x.ok === false ? 'off' : ''}" ${x.ok === false ? 'title="Pas d’accès du bot à ce salon"' : `onmousedown="evtComboChoix(this,'${esc(x.id)}','${esc(x.nom).replace(/'/g, '&#39;')}')"`}>${x.ok === false ? '🔒 ' : '#'}${esc(x.nom)}<small>${esc(x.cat || '')}</small></div>`).join('') + (ok.length > vus.length ? `<div class="ev-co more">… ${ok.length - vus.length} autre(s) : précise ta recherche</div>` : '')
    : '<div class="ev-co more">Aucun salon ne correspond</div>';
  box.hidden = false;
}
function evtComboCache(inp) { const box = inp.nextElementSibling; if (box) box.hidden = true; }
function evtComboChoix(el, id, nom) {
  const box = el.parentElement, inp = box.previousElementSibling;
  window[inp.dataset.fn](inp.dataset.cle, id);
  inp.value = '#' + nom.replace(/&#39;/g, "'"); box.hidden = true; inp.blur();
}
function evtTab(t) { EVT_TAB = t; evenements(); }

function evenements() {
  evtInit();
  if (!S.sheets && typeof ensureSheets === 'function') ensureSheets().then(() => { if (VIEW === 'evenements') evenements(); }).catch(() => {});
  const D = evtData(), now = Date.now() / 1000;
  const gwCours = D.giveaways.filter(g => g.etat === 'en_cours'), aDeclarer = D.matchs.filter(m => m.etat !== 'termine' && m.debut <= now),
    aVenir = D.matchs.filter(m => m.etat !== 'termine' && m.debut > now), finis = D.matchs.filter(m => m.etat === 'termine');
  const kpi = [['#e8a020', gwCours.length, 'Giveaways en cours'], ['#5865f2', aVenir.length, 'Matchs à venir'], ['#ff9a3d', aDeclarer.length, 'Résultats à déclarer'], ['#4fa97b', D.classements.length, 'Classements']];
  const ro = (typeof isMembre === 'function') && isMembre();
  let corps = '';

  if (EVT_TAB === 'pari') {
    const G = EVT_G, champs = D.classements.filter(c => c.champ).map(c => c.titre);
    const ligne = (l, i) => `<tr><td><select class="field" style="width:64px" onchange="evtSetL(${i},'icone',this.value)">${EVT_SPORTS.map(s => `<option ${s === l.icone ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><input class="field" placeholder="Équipe 1" value="${esc(l.a)}" oninput="evtSetL(${i},'a',this.value)"></td>
      <td><input class="field" placeholder="Équipe 2" value="${esc(l.b)}" oninput="evtSetL(${i},'b',this.value)"></td>
      <td><input class="field" type="datetime-local" value="${esc(l.dt)}" onchange="evtSetL(${i},'dt',this.value)"></td>
      <td style="text-align:center"><input type="checkbox" ${l.nul ? 'checked' : ''} onchange="evtSetL(${i},'nul',this.checked)"></td>
      <td><button class="btn btn-sm btn-ghost" title="Retirer ce match" onclick="evtSuppL(${i})">✕</button></td></tr>`;
    const resLigne = m => {
      const r = EVT_RES[m.id] || {}, bt = (c, txt, cl) => `<button class="ev-pick ${r.c === c ? 'on ' + cl : ''}" onclick="evtPick(${m.id},'${c}')">${esc(txt)}</button>`;
      return `<tr><td><b>${esc(m.icone)} ${esc(m.a)} – ${esc(m.b)}</b><div class="fx-mut" style="margin:2px 0 0">${esc(m.grille)} · ${evtQuand(m.debut)} (${evtDansLe(m.debut)}) · ${m.votes} pronostic(s)</div></td>
        <td><div class="ev-picks">${bt('a', m.a, 'a')}${m.nul ? bt('n', 'Nul', 'n') : ''}${bt('b', m.b, 'b')}</div></td>
        <td>${m.score ? `<div class="ev-sc"><input class="field" placeholder="–" value="${esc(r.sa || '')}" oninput="evtScore(${m.id},'sa',this.value)"><span>–</span><input class="field" placeholder="–" value="${esc(r.sb || '')}" oninput="evtScore(${m.id},'sb',this.value)"></div>` : '<span class="fx-mut">—</span>'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-gold" onclick="evtValider(${m.id})">Valider</button> <button class="btn btn-sm btn-ghost" title="Supprimer ce match" onclick="evtAnnulerMatch(${m.id})">✕</button></td></tr>`;
    };
    const finiLigne = m => {
      const r = m.resultat || {}, gag = r.c === 'n' ? 'Match nul' : (r.c === 'a' ? m.a : m.b) + ' gagne';
      return `<tr><td><b>${esc(m.icone)} ${esc(m.a)}${r.s ? ' ' + r.s[0] + ' – ' + r.s[1] + ' ' : ' – '}${esc(m.b)}</b><div class="fx-mut" style="margin:2px 0 0">${esc(m.grille)} · ${evtQuand(m.debut)}</div></td><td><span class="ev-pill ok">🏆 ${esc(gag)}</span></td><td class="fx-mut">${m.votes} pronostic(s)</td><td style="text-align:right"><button class="btn btn-sm btn-ghost" onclick="EVT_RES[${m.id}]={};evtCorriger(${m.id})">Corriger</button></td></tr>`;
    };
    corps = `
    <div class="panel ev-card"><div class="fx-lbl">🎯 Nouvelle grille</div>
      <div class="ev-bar">
        <input class="field" style="flex:1;min-width:150px" placeholder="Titre (facultatif) — ex. Semaine 47" value="${esc(G.titre)}" oninput="evtSetG('titre',this.value)">
        <input class="field" style="flex:1;min-width:150px" list="evtChamps" placeholder="🏅 Championnat (vide = points de cette grille seulement)" value="${esc(G.champ)}" oninput="evtSetG('champ',this.value)"><datalist id="evtChamps">${champs.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        <div style="flex:1;min-width:200px">${evtSalonSel(D, 'salon', G.salon, 'evtSetG')}</div>
        <label class="ev-chk"><input type="checkbox" ${G.score ? 'checked' : ''} onchange="evtSetG('score',this.checked)"> 🎯 Score exact (+1 pt)</label>
      </div>
      <div style="overflow-x:auto"><table class="ev-t"><thead><tr><th></th><th>Équipe 1</th><th>Équipe 2</th><th>Date et heure</th><th>Nul</th><th></th></tr></thead><tbody>${G.lignes.map(ligne).join('')}</tbody></table></div>
      <div class="ev-bar" style="margin-top:12px"><button class="btn btn-ghost" onclick="evtAjoutL()">＋ Ajouter un match</button><button class="btn btn-ghost" onclick="evtColler()">📋 Coller une liste</button>
        <span class="fx-mut" style="margin:0">Heures de ton navigateur · 1 point par bon pronostic</span>
        <button class="btn btn-gold" style="margin-left:auto" ${ro ? 'disabled' : ''} onclick="evtPublier()">🚀 Publier sur Discord</button></div>
    </div>
    <div class="panel ev-card"><div class="fx-lbl">✅ Résultats à déclarer <span class="ev-pill o">${aDeclarer.length}</span></div>
      ${aDeclarer.length ? `<div style="overflow-x:auto"><table class="ev-t"><thead><tr><th>Match</th><th>Vainqueur</th><th>Score</th><th></th></tr></thead><tbody>${aDeclarer.sort((a, b) => a.debut - b.debut).map(resLigne).join('')}</tbody></table></div>` : '<div class="empty">Aucun match en attente de résultat</div>'}
    </div>
    ${aVenir.length ? `<div class="panel ev-card"><div class="fx-lbl">📅 À venir · pronostics ouverts</div><div style="overflow-x:auto"><table class="ev-t"><tbody>${aVenir.sort((a, b) => a.debut - b.debut).map(m => `<tr><td><b>${esc(m.icone)} ${esc(m.a)} – ${esc(m.b)}</b><div class="fx-mut" style="margin:2px 0 0">${esc(m.grille)}</div></td><td>${evtQuand(m.debut)} <span class="fx-mut">(${evtDansLe(m.debut)})</span></td><td>${m.votes} pronostic(s)</td><td style="text-align:right"><button class="btn btn-sm btn-ghost" title="Supprimer ce match" onclick="evtAnnulerMatch(${m.id})">✕</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${finis.length ? `<div class="panel ev-card"><div class="fx-lbl">🏁 Terminés (derniers)</div><div style="overflow-x:auto"><table class="ev-t"><tbody>${finis.slice(0, 12).map(finiLigne).join('')}</tbody></table></div></div>` : ''}`;
  } else if (EVT_TAB === 'gw') {
    const g = EVT_GW;
    const gl = x => {
      const v = x.vainqueurs.map(w => esc(evtNomDe(w.id, w.nom))).join(', ') || 'personne';
      const act = x.etat === 'en_cours'
        ? `<button class="btn btn-sm btn-gold" onclick="evtGW('gw_terminer',${x.id},'Terminer ce giveaway maintenant et tirer les gagnants ?')">Terminer maintenant</button> <button class="btn btn-sm btn-ghost" onclick="evtGW('gw_annuler',${x.id},'Annuler ce giveaway sans tirage ?')">Annuler</button>`
        : x.etat === 'termine' ? `<button class="btn btn-sm btn-ghost" onclick="evtGW('gw_relancer',${x.id},'Retirer de nouveaux gagnants ?')">🔁 Relancer</button>` : '';
      return `<tr class="${x.etat === 'annule' ? 'ev-off' : ''}"><td><b>🎁 ${esc(x.lot)}</b><div class="fx-mut" style="margin:2px 0 0">#${x.id} · ${x.gagnants} gagnant(s)${x.role ? ' · rôle requis' : ''}</div></td>
        <td>${x.etat === 'en_cours' ? `<span class="ev-pill o">en cours</span> ${evtQuand(x.fin)} <span class="fx-mut">(${evtDansLe(x.fin)})</span>` : x.etat === 'termine' ? `<span class="ev-pill ok">terminé</span> 🏆 ${v}` : '<span class="ev-pill">annulé</span>'}</td>
        <td>${x.participants} participant(s)</td><td style="text-align:right;white-space:nowrap">${act}</td></tr>`;
    };
    corps = `
    <div class="panel ev-card"><div class="fx-lbl">🎁 Nouveau giveaway</div>
      <div class="ev-bar">
        <input class="field" style="flex:2;min-width:200px" placeholder="Lot — ex. Une Tesla Model S" value="${esc(g.lot)}" oninput="evtSetGW('lot',this.value)">
        <div style="flex:1;min-width:200px">${evtSalonSel(D, 'salon', g.salon, 'evtSetGW')}</div>
      </div>
      <div class="ev-bar" style="margin-top:10px">
        <div class="ev-picks">${EVT_DUREES.map(([t, s]) => `<button class="ev-pick ${+g.duree === s ? 'on a' : ''}" onclick="EVT_GW.duree=${s};evenements()">${t}</button>`).join('')}<button class="ev-pick ${g.duree === 'perso' ? 'on a' : ''}" onclick="EVT_GW.duree='perso';evenements()">Autre…</button></div>
        ${g.duree === 'perso' ? `<input class="field" style="width:130px" placeholder="ex. 2j 6h" value="${esc(g.perso)}" oninput="evtSetGW('perso',this.value)">` : ''}
        <label class="ev-chk">Gagnants <input class="field" type="number" min="1" max="20" style="width:70px" value="${esc(g.gagnants)}" oninput="evtSetGW('gagnants',this.value)"></label>
        <select class="field" style="max-width:240px" onchange="evtSetGW('role',this.value)">${evtOpts(D.roles, g.role, '🔓 Ouvert à tous')}</select>
        <button class="btn btn-gold" style="margin-left:auto" ${ro ? 'disabled' : ''} onclick="evtLancerGW()">🎁 Lancer le giveaway</button>
      </div></div>
    <div class="panel ev-card"><div class="fx-lbl">📋 Giveaways</div>${D.giveaways.length ? `<div style="overflow-x:auto"><table class="ev-t"><tbody>${D.giveaways.map(gl).join('')}</tbody></table></div>` : '<div class="empty">Aucun giveaway pour le moment</div>'}</div>`;
  } else {
    corps = D.classements.length ? `<div class="ev-cls">${D.classements.map(c => `<div class="panel ev-card"><div class="fx-lbl">🏆 ${esc(c.titre)} ${c.champ ? '<span class="ev-pill o">championnat</span>' : ''}</div>
      ${c.lignes.length ? `<table class="ev-t"><thead><tr><th>#</th><th>Joueur</th><th>Points</th><th>Bons pronos</th></tr></thead><tbody>${c.lignes.map((l, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${esc(evtNomDe(l.id, l.nom))}</b></td><td><b style="color:#e8a020">${l.pts}</b></td><td>${l.bons}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun point pour le moment</div>'}
      ${c.champ ? `<div style="margin-top:10px"><button class="btn btn-sm btn-ghost" onclick="evtResetChamp(decodeURIComponent('${encodeURIComponent(c.titre)}'))">Remettre à zéro</button></div>` : ''}</div>`).join('')}</div>`
      : '<div class="panel ev-card"><div class="empty">Aucun classement : il apparaît dès le premier résultat déclaré</div></div>';
  }

  const attente = !D.maj ? `<div class="panel ev-card ev-warn">⏳ Le bot n'a pas encore envoyé l'état des événements au site. Vérifie qu'il tourne avec les derniers fichiers (giveaway, pronostics, site_bridge) — la liste des salons et des rôles apparaîtra ensuite.</div>` : '';
  $('#main').innerHTML = `<div class="topbar"><div><h2>Événements</h2><div class="sub">Giveaways et pronostics — tu prépares ici, le bot publie sur Discord tout seul${D.maj ? ' · état du bot : ' + evtDansLe(D.maj) : ''}</div></div>
    <div class="vd-seg">${[['pari', '🎯 Pronostics'], ['gw', '🎁 Giveaways'], ['class', '🏆 Classements']].map(([k, l]) => `<button class="${EVT_TAB === k ? 'on' : ''}" onclick="evtTab('${k}')">${l}</button>`).join('')}</div></div>
    <div class="vd-sum" style="grid-template-columns:repeat(4,1fr)">${kpi.map(([c, n, l]) => `<div style="--c:${c}"><b>${n}</b><span>${l}</span></div>`).join('')}</div>${attente}${corps}`;
}
function evtCorriger(id) {                      // un match terminé repasse dans « à déclarer » côté saisie : on affiche un modal simple
  const m = evtData().matchs.find(x => x.id === id); if (!m) return;
  const r = EVT_RES[id] = {};
  openModal(`<h3 style="margin:0 0 8px">Corriger le résultat</h3><div class="fx-mut" style="margin:0 0 12px"><b>${esc(m.a)} – ${esc(m.b)}</b> · les points sont recalculés.</div>
    <div class="ev-picks" id="evtCorr">${['a', 'n', 'b'].filter(c => c !== 'n' || m.nul).map(c => `<button class="ev-pick" data-c="${c}" onclick="evtCorrPick(${id},'${c}')">${c === 'n' ? 'Nul' : esc(c === 'a' ? m.a : m.b)}</button>`).join('')}</div>
    ${m.score ? `<div class="ev-sc" style="margin-top:10px"><input class="field" placeholder="score ${esc(m.a)}" oninput="EVT_RES[${id}].sa=this.value.replace(/\\D/g,'')"><span>–</span><input class="field" placeholder="score ${esc(m.b)}" oninput="EVT_RES[${id}].sb=this.value.replace(/\\D/g,'')"></div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-gold" onclick="evtCorrValider(${id})">Enregistrer</button></div>`);
}
function evtCorrPick(id, c) { EVT_RES[id].c = c; document.querySelectorAll('#evtCorr .ev-pick').forEach(b => b.classList.toggle('on', b.dataset.c === c)); }
async function evtCorrValider(id) {
  const r = EVT_RES[id] || {}, aS = r.sa !== undefined && r.sa !== '', bS = r.sb !== undefined && r.sb !== '';
  if (aS !== bS) return toast('Donne les deux scores, ou aucun');
  if (aS) r.c = +r.sa > +r.sb ? 'a' : +r.sb > +r.sa ? 'b' : 'n';
  if (!r.c) return toast('Choisis le vainqueur ou entre le score');
  closeModal();
  const ok = await evtOrdre('pari_resultat', { match: id, c: r.c, s: aS ? [+r.sa, +r.sb] : null });
  if (ok) delete EVT_RES[id];
}
