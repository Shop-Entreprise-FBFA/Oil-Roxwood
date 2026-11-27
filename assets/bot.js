/* ================== GESTION DU BOT · tout se règle ici, sans toucher au code ==================
   Réservé à la Direction. Les réglages vivent dans S.botcfg (synchronisé avec le reste du dashboard, donc dans
   data/etat.json) ; le bot les relit toutes les ~45 s et les applique sans redémarrage.
   Ce que le BOT publie en retour (fichiers lisibles du site) :
     data/bot-statut.json    état, salons, rôles, commandes, avertissements            (toutes les 15 min + à chaque changement)
     data/bot-stats.json     commandes clients et recrutement, par semaine              (toutes les 30 min)
     data/bot-messages.json  journal des messages supprimés/modifiés — CHIFFRÉ (le dépôt est public)
   Données de S.botcfg :
     v, maj, par              version enregistrée, date, auteur
     modules.{id}.on          fonctions allumées/éteintes
     roles.{staff,resprunner,drh,direction}  rôles Discord de chaque jeton de la grille des droits
     cmds.{/nom}              {on, roles[], delai(s), salons[]}
     messages.{bienvenue,refus,desactivee,maintenance}
     planifs[]                annonces programmées      · actions[] / retours[]  ordres au bot et ses réponses
     moderation               spam, filtres, sanctions, anti-raid, compte récent  · msglog  journal des messages
     alertes.stock · statut · maintenance · historique[] (versions, pour revenir en arrière)
   Chargé par admin.html ; utilise ses globales (S, esc, $, toast, openModal, closeModal, save, sbPushNow, jlog,
   currentUser, rolePerso, RoxwoodGH, isRO, isMembre, lundiCourant). */

const BOT_TABS = [
  ['apercu', '📊', 'Vue d’ensemble'], ['fonctions', '🧩', 'Fonctions'], ['salons', '📡', 'Salons & rôles'],
  ['cmds', '⌨️', 'Commandes & droits'], ['msgs', '✉️', 'Messages'], ['auto', '⏰', 'Annonces programmées'],
  ['mod', '🛡️', 'Modération'], ['jmsg', '🗑️', 'Messages supprimés'], ['stats', '📈', 'Statistiques'],
  ['outils', '🧰', 'Alertes & outils'], ['jrn', '📜', 'Journal & versions']
];
/* branchement : 'complet' = la fonction elle-même lit ses réglages · 'cmd' = on peut couper ses commandes */
const BOT_MODULES = [
  ['bienvenue', '👋', 'Message de bienvenue', 'Accueil des nouveaux membres (texte réglable dans « Messages »)', 'RH & recrutement', 'complet'],
  ['absences', '🌴', 'Absences', 'Déclaration d’absence', 'RH & recrutement', 'cmd'],
  ['contrats', '📑', 'Contrats', 'Contrats de livraison et de travail', 'RH & recrutement', 'cmd'],
  ['blacklist', '⛔', 'Liste noire', 'Gestion de la liste noire', 'RH & recrutement', 'cmd'],
  ['facture', '🧾', 'Factures', 'Création de factures', 'Commerce', 'cmd'],
  ['commercial', '🛒', 'Commercial', 'Commandes du service commercial', 'Commerce', 'cmd'],
  ['vehicules', '🚗', 'Véhicules & plaques', 'Recherche de plaques et de véhicules', 'Commerce', 'cmd'],
  ['giveaway', '🎁', 'Giveaway', 'Tirages au sort', 'Animation', 'cmd'],
  ['tombola', '🎟️', 'Tombola', 'Billets et tirage', 'Animation', 'cmd'],
  ['pronostics', '⚽', 'Pronostics', 'Paris amicaux sur les matchs', 'Animation', 'cmd'],
  ['tirage', '🎲', 'Tirage', 'Tirage au sort simple', 'Animation', 'cmd'],
  ['musique', '🎵', 'Musique', 'Lecteur vocal', 'Animation', 'cmd'],
  ['moderation', '🔨', 'Commandes de modération', 'Avertissements, timeouts…', 'Modération', 'cmd'],
  ['stats', '📊', 'Statistiques (/info)', 'Fiche d’un membre', 'Système', 'cmd']
];
const BOT_JETONS = [['tous', 'Tous'], ['staff', 'Staff'], ['resprunner', 'Resp. Runner'], ['drh', 'DRH'], ['direction', 'Direction']];
const BOT_VARS = ['{membre}', '{serveur}', '{nb_membres}', '{date}', '{nom}'];
const BOT_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const BOT_HIDE = ['actions', 'retours', 'historique'];

let BOT_TAB = 'apercu', BOT_D = null, BOT_ST = null, BOT_STATS = null, BOT_MSG = null, BOT_MSG_LIGNES = null, BOT_MSG_ERR = '';
let BOT_MSG_TAB = 'imp', BOT_MSG_Q = '', BOT_STAT_P = 'sem', BOT_CMD_Q = '', BOT_CHARGE = 0, BOT_NOUV = null;

/* ---------- accès aux réglages ---------- */
const bClone = o => JSON.parse(JSON.stringify(o || {}));
function bStrip(c) { const o = bClone(c); BOT_HIDE.forEach(k => delete o[k]); delete o.v; delete o.maj; delete o.par; return o; }
function bDraft() { if (!BOT_D) { BOT_D = bClone(S.botcfg); BOT_HIDE.forEach(k => delete BOT_D[k]); } return BOT_D; }
function bGet(p, d) { let o = bDraft(); for (const k of p.split('.')) { if (o == null || typeof o !== 'object') return d; o = o[k]; } return o === undefined ? d : o; }
function bSet(p, v) {
  const ks = p.split('.'); let o = bDraft();
  for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = v;
}
function bDirty() { return JSON.stringify(bStrip(bDraft())) !== JSON.stringify(bStrip(S.botcfg)); }
function bPeut() {
  if (!RoxwoodGH.peutEcrire() || isRO('bot')) return false;
  const cu = currentUser(); return (cu && cu.role === 'direction') || sessionStorage.getItem('orx_user') === 'SECOURS';
}
function bSetV(p, v, kind) { bSet(p, kind === 'n' ? (+v || 0) : kind === 'l' ? String(v).split(/[\n,;]+/).map(x => x.trim()).filter(Boolean) : String(v)); botRender(); }
function bTog(p, def) { bSet(p, !bGet(p, def === undefined ? false : def)); botRender(); }
function bAdd(p, v) { if (!v) return; const a = bGet(p, []).slice(); if (!a.includes(v)) a.push(v); bSet(p, a); botRender(); botModalRefresh(p); }
function bDel(p, v) { bSet(p, bGet(p, []).filter(x => x !== v)); botRender(); botModalRefresh(p); }
function bUid(pre) { return pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function bSw(p, def, off) { const on = bGet(p, def); return `<button type="button" class="bt-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" ${off ? 'disabled' : `onclick="bTog('${p}',${def ? 'true' : 'false'})"`}></button>`; }
function bNum(p, def, suf, w) { return `<input class="field bt-num" style="width:${w || 84}px" type="number" min="0" value="${esc(bGet(p, def))}" onchange="bSetV('${p}',this.value,'n')">${suf ? `<span class="bt-suf">${suf}</span>` : ''}`; }
function bTxt(p, ph, w) { return `<input class="field" ${w ? `style="width:${w}px"` : ''} value="${esc(bGet(p, ''))}" placeholder="${esc(ph || '')}" onchange="bSetV('${p}',this.value,'s')">`; }

/* ---------- inventaire publié par le bot ---------- */
const bSalons = () => (BOT_ST && BOT_ST.salons) || [];
const bRoles = () => (BOT_ST && BOT_ST.roles) || [];
function bNomSalon(id) { const s = bSalons().find(x => x.id === String(id)); return s ? '#' + s.nom : '#' + id; }
function bNomRole(id) { const r = bRoles().find(x => x.id === String(id)); return r ? '@' + r.nom : '@' + id; }
function bSalonOpts(cur, typ) {
  const ls = bSalons().filter(s => !typ || s.type === typ), cats = {};
  ls.forEach(s => (cats[s.cat || 'Sans catégorie'] = cats[s.cat || 'Sans catégorie'] || []).push(s));
  let h = `<option value="">— choisir un salon —</option>`;
  Object.keys(cats).forEach(c => { h += `<optgroup label="${esc(c)}">${cats[c].map(s => `<option value="${s.id}"${String(cur) === s.id ? ' selected' : ''}>${s.type === 'vocal' ? '🔊' : '#'} ${esc(s.nom)}</option>`).join('')}</optgroup>`; });
  if (cur && !ls.some(s => s.id === String(cur))) h += `<option value="${esc(cur)}" selected>${esc(cur)} (inconnu)</option>`;
  return h;
}
function bSalonSel(p, w) {
  if (!bSalons().length) return `<input class="field" style="width:${w || 190}px" placeholder="ID du salon" value="${esc(bGet(p, ''))}" onchange="bSetV('${p}',this.value,'s')">`;
  return `<select class="field" style="max-width:${w || 260}px" onchange="bSetV('${p}',this.value,'s')">${bSalonOpts(bGet(p, ''))}</select>`;
}
function bMulti(p, kind) {   // liste d'identifiants (salons ou rôles) en pastilles
  const a = bGet(p, []), liste = kind === 'role' ? bRoles() : bSalons(), nom = kind === 'role' ? bNomRole : bNomSalon;
  const chips = a.map(id => `<span class="bt-chip">${esc(nom(id))}<button type="button" onclick="bDel('${p}','${esc(id)}')" aria-label="Retirer">×</button></span>`).join('');
  const add = liste.length
    ? `<select class="field bt-add" onchange="bAdd('${p}',this.value)"><option value="">＋ ajouter</option>${liste.filter(x => !a.includes(x.id)).map(x => `<option value="${x.id}">${kind === 'role' ? '@' : '#'} ${esc(x.nom)}</option>`).join('')}</select>`
    : `<input class="field bt-add" placeholder="＋ identifiant" onchange="bAdd('${p}',this.value.trim());this.value=''">`;
  return `<div class="bt-chips">${chips}${add}</div>`;
}
const bAge = t => t ? Date.now() - new Date(t).getTime() : Infinity;
const bEnLigne = () => !!BOT_ST && bAge(BOT_ST.t) < 35 * 60000;
function bDuree(s) { s = +s || 0; const j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return j ? `${j} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`; }
function bIlYa(t) { const ms = bAge(t); if (!isFinite(ms)) return 'jamais'; const m = Math.round(ms / 60000); return m < 2 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; }

/* ---------- chargement des fichiers du bot ---------- */
async function botCharger(force) {
  if (!force && Date.now() - BOT_CHARGE < 20000) return;
  BOT_CHARGE = Date.now();
  const lit = async f => { try { const r = await fetch('data/' + f + '?ts=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const [st, sts, msg] = await Promise.all([lit('bot-statut.json'), lit('bot-stats.json'), lit('bot-messages.json')]);
  BOT_ST = st; BOT_STATS = sts;
  if (msg && (!BOT_MSG || BOT_MSG.t !== msg.t)) { BOT_MSG = msg; BOT_MSG_LIGNES = null; }
  if (BOT_MSG && !BOT_MSG_LIGNES) await botMsgOuvrir(true);
  if (VIEW === 'bot' && !editionEnCours()) botRender();
}

/* ---------- enregistrement ---------- */
function bResume(a, b) {
  const out = [];
  const marche = (x, y, p) => {
    if (out.length > 40) return;
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y))
      new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => marche(x[k], y[k], p ? p + '.' + k : k));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(p);
  };
  marche(bStrip(a), bStrip(b), '');
  return out;
}
function botEnregistrer() {
  if (!bPeut()) return toast('⚠️ Réservé à la Direction (avec le jeton d’écriture)');
  const avant = S.botcfg || {}, ch = bResume(avant, BOT_D);
  if (!ch.length) return toast('Rien à enregistrer');
  const nv = bClone(BOT_D), cu = currentUser(), qui = (cu && cu.user) || sessionStorage.getItem('orx_user') || '';
  nv.actions = avant.actions || []; nv.retours = avant.retours || [];
  nv.v = (avant.v || 0) + 1; nv.maj = Date.now(); nv.par = qui;
  const hist = (avant.historique || []).slice(-11);
  hist.push({ v: nv.v, t: nv.maj, par: qui, n: ch.length, ch: ch.slice(0, 6), snap: bStrip(BOT_D) });
  nv.historique = hist;
  S.botcfg = nv; BOT_D = null;
  jlog(`Gestion du bot : version ${nv.v} enregistrée (${ch.length} réglage(s))`);
  save(); sbPushNow();
  toast('✅ Réglages enregistrés — le bot les applique d’ici une minute');
  botRender();
}
function botAnnuler() { BOT_D = null; botRender(); toast('Modifications annulées'); }
function botAction(a) {     // ordre à exécuter par le bot (envoyer un message, tester…), répondu dans retours[]
  if (!bPeut()) return toast('⚠️ Réservé à la Direction (avec le jeton d’écriture)');
  const c = S.botcfg = S.botcfg || {};
  c.actions = (c.actions || []).concat([{ id: bUid('a'), t: Date.now(), ...a }]);
  c.maj = Date.now();
  save(); sbPushNow(); toast('📨 Ordre envoyé au bot…', 3000);
  botRender();
}

/* ---------- page ---------- */
function bot() {
  if (!S.botcfg) S.botcfg = {};
  bDraft();
  botCharger(false);
  botRender();
}
function botRender() {
  if (VIEW !== 'bot') return;
  const y = window.scrollY, ch = bResume(S.botcfg || {}, BOT_D), en = bEnLigne(), peut = bPeut();
  const tabs = BOT_TABS.map(([k, ic, nom]) => `<button class="bt-tab${BOT_TAB === k ? ' on' : ''}" onclick="BOT_TAB='${k}';botRender()">${ic} ${nom}</button>`).join('');
  const corps = ({ apercu: botApercu, fonctions: botFonctions, salons: botSalons, cmds: botCmds, msgs: botMsgs, auto: botAuto, mod: botMod, jmsg: botJmsg, stats: botStats, outils: botOutils, jrn: botJrn })[BOT_TAB]();
  $('#main').innerHTML = `
  ${paramsTabsHTML('bot')}
  <div class="topbar">
    <div><h2>🤖 Gestion du bot</h2><div class="sub">${en ? '🟢 En ligne' : '🔴 Hors ligne ou inconnu'}${BOT_ST ? ` · signal ${bIlYa(BOT_ST.t)}` : ''} · réglages version ${(S.botcfg || {}).v || 0}${BOT_ST && BOT_ST.version_cfg != null ? (BOT_ST.version_cfg === (S.botcfg || {}).v ? ' · appliqués ✔' : ' · en cours d’application…') : ''}</div></div>
    <div class="bt-save">${ch.length ? `<span class="bt-pill g">${ch.length} changement${ch.length > 1 ? 's' : ''} non enregistré${ch.length > 1 ? 's' : ''}</span>` : ''}
      <button class="btn btn-ghost" ${ch.length ? '' : 'disabled'} onclick="botAnnuler()">↩ Annuler</button>
      <button class="btn btn-gold" ${ch.length && peut ? '' : 'disabled'} onclick="botEnregistrer()">💾 Enregistrer et appliquer</button></div>
  </div>
  ${peut ? '' : '<div class="bt-note">👁 Lecture seule : il faut être Direction et avoir collé son jeton d’écriture (Mon profil) pour modifier.</div>'}
  <div class="bt-tabs">${tabs}</div>
  <div class="bt-body">${corps}</div>`;
  window.scrollTo(0, y);
}

/* ---------- 1. Vue d'ensemble ---------- */
function botApercu() {
  const st = BOT_ST, c = bDraft(), ev = [];
  if (!st) ev.push(['ko', 'Le bot n’a encore rien publié', 'Il faut envoyer sur le serveur le nouveau fichier du bot puis le redémarrer (voir l’onglet Alertes & outils).']);
  else {
    if (!bEnLigne()) ev.push(['ko', 'Pas de signal du bot depuis ' + bIlYa(st.t).replace('il y a ', ''), 'Le bot envoie un signal toutes les 15 minutes : vérifie qu’il tourne.']);
    (st.avertissements || []).forEach(a => ev.push(['g', a, 'Corrige le réglage ou les droits du bot sur Discord.']));
    if ((c.msglog || {}).on && st.msglog && st.msglog.etat === 'cle_manquante') ev.push(['g', 'Journal des messages : clé de chiffrement manquante', 'Ajoute ORX_MSG_KEY=… dans cogs/.env sur le serveur, puis redémarre le bot.']);
  }
  if (!((c.roles || {}).drh || []).length) ev.push(['g', 'Le rôle DRH n’est lié à aucun rôle Discord', 'Onglet « Salons & rôles » : choisis le rôle pour que la grille des droits le connaisse.']);
  const actifs = BOT_MODULES.filter(m => bGet('modules.' + m[0] + '.on', true)).length;
  const top = (st && st.top_cmds) || [], mx = Math.max(1, ...top.map(x => x[1]));
  return `
  <div class="grid g4" style="margin-bottom:16px">
    <div class="panel kpi"><div class="lbl">État</div><div class="val">${bEnLigne() ? '🟢 En ligne' : '🔴 Hors ligne'}</div><div class="delta">${st ? `${st.latence_ms} ms · actif depuis ${bDuree(st.uptime_s)}` : 'aucune donnée'}</div></div>
    <div class="panel kpi"><div class="lbl">Commandes · 24 h</div><div class="val">${st ? st.cmds24h : '—'}</div><div class="delta">${st ? `${st.membres} membres sur ${esc(st.serveur)}` : ''}</div></div>
    <div class="panel kpi"><div class="lbl">Erreurs · 24 h</div><div class="val ${st && st.erreurs24h ? 'down' : ''}">${st ? st.erreurs24h : '—'}</div><div class="delta">${st && st.erreurs && st.erreurs.length ? esc(st.erreurs[st.erreurs.length - 1].txt).slice(0, 60) : 'aucune'}</div></div>
    <div class="panel kpi"><div class="lbl">Fonctions actives</div><div class="val">${actifs}<small> / ${BOT_MODULES.length}</small></div><div class="delta">${BOT_MODULES.length - actifs} éteinte(s)</div></div>
  </div>
  <div class="grid g2">
    <div class="panel"><h3>⚠️ À régler</h3>${ev.length ? ev.map(e => `<div class="bt-li"><span class="bt-pill ${e[0]}">${e[0] === 'ko' ? 'Important' : 'À voir'}</span><div><b>${esc(e[1])}</b><div class="mut sm">${esc(e[2])}</div></div></div>`).join('') : '<div class="bt-li"><span class="bt-pill ok">OK</span><span>Rien à signaler.</span></div>'}</div>
    <div class="panel"><h3>⚡ Actions rapides</h3>
      <div class="bt-li"><div><b>Mode maintenance</b><div class="mut sm">Seul le staff peut utiliser les commandes</div></div><span class="sp"></span>${bSw('maintenance', false, !bPeut())}</div>
      <div class="bt-row" style="margin-top:12px"><button class="btn btn-ghost" onclick="botCharger(true);toast('Actualisé')">🔄 Actualiser</button>
        <button class="btn btn-ghost" onclick="botAction({type:'sync'})">🔁 Resynchroniser les commandes</button></div>
      <div class="lbl" style="margin-top:14px">Statut affiché sur Discord</div>
      <div class="bt-row"><select class="field" style="width:130px" onchange="bSetV('statut.type',this.value,'s')">${[['joue', 'Joue à'], ['ecoute', 'Écoute'], ['regarde', 'Regarde'], ['concurrence', 'Participe à']].map(o => `<option value="${o[0]}"${bGet('statut.type', 'joue') === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>${bTxt('statut.texte', 'Oil Roxwood — /aide', 260)}</div>
    </div>
  </div>
  <div class="panel" style="margin-top:16px"><h3>📈 Commandes les plus utilisées (24 h)</h3>${top.length ? top.map(x => `<div class="bt-bar"><span class="tag">/${esc(x[0])}</span><div class="bt-barv"><i style="width:${Math.round(x[1] / mx * 100)}%"></i></div><b>${x[1]}</b></div>`).join('') : '<div class="empty">Pas encore de données.</div>'}</div>`;
}

/* ---------- 2. Fonctions ---------- */
function botFonctions() {
  const cats = [...new Set(BOT_MODULES.map(m => m[4]))], off = !bPeut();
  return `<div class="bt-note">Éteindre une fonction ferme ses commandes (« désactivée pour le moment »). Les fonctions marquées <b>complet</b> lisent aussi leurs réglages ici. Les autres parties du bot (candidatures, tickets, factures reçues…) tournent toujours : on ne coupe pas ce qui fait vivre l’entreprise.</div>
  <div class="grid g2">${cats.map(cat => `<div class="panel"><h3>${esc(cat)}</h3>${BOT_MODULES.filter(m => m[4] === cat).map(m => `
    <div class="bt-mod"><div class="bt-ico">${m[1]}</div><div class="sp"><b>${esc(m[2])}</b><div class="mut sm">${esc(m[3])}</div></div>
    <span class="bt-pill ${m[5] === 'complet' ? 'ok' : ''}">${m[5] === 'complet' ? 'complet' : 'commandes'}</span>${bSw('modules.' + m[0] + '.on', true, off)}</div>`).join('')}</div>`).join('')}
  <div class="panel"><h3>Modération automatique</h3>
    <div class="bt-mod"><div class="bt-ico">🛡️</div><div class="sp"><b>Anti-spam (messages identiques)</b><div class="mut sm">Réglages dans l’onglet Modération</div></div><span class="bt-pill ok">complet</span>${bSw('moderation.spam.on', true, off)}</div>
    <div class="bt-mod"><div class="bt-ico">🚨</div><div class="sp"><b>Filtres, anti-raid, comptes récents</b><div class="mut sm">Onglet Modération</div></div><button class="btn btn-ghost btn-sm" onclick="BOT_TAB='mod';botRender()">Régler</button></div>
    <div class="bt-mod"><div class="bt-ico">🗑️</div><div class="sp"><b>Journal des messages supprimés</b><div class="mut sm">Onglet Messages supprimés</div></div>${bSw('msglog.on', false, off)}</div>
  </div></div>`;
}

/* ---------- 3. Salons & rôles ---------- */
function botSalons() {
  const R = (k, nom, aide) => `<div class="bt-field"><div class="lbl">${nom}</div>${bMulti('roles.' + k, 'role')}<div class="hint">${aide}</div></div>`;
  return `${BOT_ST ? '' : '<div class="bt-note">Le bot n’a pas encore publié la liste de ses salons et rôles : en attendant, tu peux coller des identifiants à la main.</div>'}
  <div class="grid g2">
  <div class="panel"><h3>👥 Rôles de la grille des droits</h3>
    <div class="hint" style="margin-bottom:10px">Dis au bot quels rôles Discord se cachent derrière chaque colonne de « Commandes & droits ». Les rôles déjà codés (staff, Responsable Runner, Direction) restent valables en plus.</div>
    ${R('staff', 'Staff', 'Accès aux commandes d’équipe')}${R('resprunner', 'Responsable Runner', 'Déjà connu du bot ; ajoute-en au besoin')}${R('drh', 'DRH', 'Le rôle DRH n’existait pas côté bot')}${R('direction', 'Direction', 'Patron, co-patron…')}</div>
  <div class="panel"><h3>📡 Salons du bot</h3>
    <div class="bt-field"><div class="lbl">Salon de bienvenue</div>${bSalonSel('messages.bienvenue.salon')}</div>
    <div class="bt-field"><div class="lbl">Alertes de stock</div>${bSalonSel('alertes.stock.salon')}</div>
    <div class="bt-field"><div class="lbl">Logs de modération automatique</div>${bSalonSel('moderation.salonLogs')}</div>
    <div class="bt-field"><div class="lbl">Alerte « suppressions en rafale »</div>${bSalonSel('msglog.alerte.salon')}</div>
    <div class="hint">D’autres salons se choisissent là où ils servent (annonces programmées, anti-raid…).</div>
    ${BOT_ST ? `<div class="lbl" style="margin-top:14px">Vu par le bot</div><div class="mut sm">${bSalons().length} salons · ${bRoles().length} rôles · mis à jour ${bIlYa(BOT_ST.t)}</div>` : ''}</div></div>`;
}

/* ---------- 4. Commandes & droits ---------- */
function bCmdRoles(nom) { const r = bGet('cmds./' + nom + '.roles', []); return r.length ? r : ['tous']; }
function bCmdTog(nom, jeton) {
  const p = 'cmds./' + nom + '.roles';
  let r = bGet(p, []).filter(x => x !== 'tous');
  if (jeton === 'tous') r = [];
  else r = r.includes(jeton) ? r.filter(x => x !== jeton) : r.concat([jeton]);
  bSet(p, r); botRender();
}
function botCmds() {
  const off = !bPeut(), q = BOT_CMD_Q.toLowerCase();
  const liste = ((BOT_ST && BOT_ST.commandes) || []).filter(c => !q || c.nom.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q));
  if (!BOT_ST || !BOT_ST.commandes || !BOT_ST.commandes.length) return '<div class="panel"><div class="empty">Le bot n’a pas encore publié sa liste de commandes. Elle arrive environ une minute après son redémarrage avec le nouveau fichier.</div></div>';
  const ligne = c => {
    const n = c.nom, ro = bCmdRoles(n), sal = bGet('cmds./' + n + '.salons', []);
    return `<tr class="${bGet('cmds./' + n + '.on', true) ? '' : 'bt-off'}"><td><span class="tag">/${esc(n)}</span><div class="hint">${esc(c.desc)}</div></td>
      ${BOT_JETONS.map(([k]) => `<td class="c"><button type="button" class="bt-chk ${k === 'tous' ? (ro.includes('tous') ? 'y' : 'n') : (ro.includes('tous') || ro.includes(k) ? 'y' : 'n')}" ${off ? 'disabled' : `onclick="bCmdTog('${esc(n)}','${k}')"`}>${(k === 'tous' ? ro.includes('tous') : (ro.includes('tous') || ro.includes(k))) ? '✓' : '–'}</button></td>`).join('')}
      <td>${bNum('cmds./' + n + '.delai', 0, 's', 64)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="botCmdSalons('${esc(n)}')">📍 ${sal.length ? sal.length + ' salon(s)' : 'partout'}</button></td>
      <td class="c">${bSw('cmds./' + n + '.on', true, off)}</td></tr>`;
  };
  return `<div class="bt-note">Ces règles <b>s’ajoutent</b> à celles déjà codées dans chaque commande : elles peuvent la fermer ou la restreindre, pas l’ouvrir davantage. Le staff n’est jamais bloqué par un délai ou un salon. Colonne « Tous » cochée = aucune restriction de rôle.</div>
  <div class="panel" style="overflow-x:auto"><div class="bt-row" style="margin-bottom:12px"><input class="field" style="max-width:300px" placeholder="🔎 Rechercher une commande…" value="${esc(BOT_CMD_Q)}" oninput="BOT_CMD_Q=this.value;clearTimeout(window._bcq);window._bcq=setTimeout(botRender,250)"><span class="sp"></span><span class="mut sm">${liste.length} commande(s)</span></div>
  <table class="bt-tab-cmd"><thead><tr><th>Commande</th>${BOT_JETONS.map(j => `<th class="c">${j[1]}</th>`).join('')}<th>Délai</th><th>Salons</th><th class="c">Actif</th></tr></thead><tbody>${liste.map(ligne).join('')}</tbody></table></div>
  <div class="grid g2" style="margin-top:16px"><div class="panel"><h3>💬 Réponses du bot</h3>
    <div class="bt-field"><div class="lbl">Refus de droit</div>${bTxt('messages.refus.texte', '⛔ Cette commande est réservée à l’équipe.')}</div>
    <div class="bt-field"><div class="lbl">Fonction désactivée</div>${bTxt('messages.desactivee.texte', '🔧 Cette fonction est désactivée pour le moment.')}</div>
    <div class="bt-field"><div class="lbl">Maintenance</div>${bTxt('messages.maintenance.texte', '🔧 Le bot est en maintenance, reviens un peu plus tard.')}</div></div>
  <div class="panel"><h3>🔧 Maintenance</h3><div class="bt-li"><div><b>Mode maintenance</b><div class="mut sm">Seul le staff peut utiliser les commandes</div></div><span class="sp"></span>${bSw('maintenance', false, off)}</div></div></div>`;
}
function botCmdSalons(n) {
  openModal(`<h3>📍 Salons autorisés — /${esc(n)}</h3><p class="hint" style="margin-bottom:10px">Vide = la commande marche partout. Sinon, uniquement dans ces salons (le staff passe partout).</p>
  <div id="btSalMod">${bMulti('cmds./' + n + '.salons', 'salon')}</div><div class="bt-row" style="margin-top:14px"><button class="btn btn-gold" onclick="closeModal();botRender()">Terminé</button></div>`);
}
function botModalRefresh(p) {      // la fenêtre « salons autorisés » se redessine seule
  const m = document.getElementById('btSalMod'); if (!m) return;
  const mm = /^cmds\.\/(.+)\.salons$/.exec(p); if (mm) m.innerHTML = bMulti(p, 'salon');
}

/* ---------- 5. Messages ---------- */
function bMsgPreview() {
  const rem = t => esc(String(t || '')).replace(/\{membre\}/g, '<span class="bt-men">@Marco</span>').replace(/\{serveur\}/g, 'Oil Roxwood').replace(/\{nb_membres\}/g, '99').replace(/\{date\}/g, new Date().toLocaleDateString('fr-FR')).replace(/\{nom\}/g, 'Marco').replace(/\n/g, '<br>');
  const btn = bGet('messages.bienvenue.boutons', []);
  return `<div class="bt-disc"><b style="color:var(--accent-2)">Oil Roxwood</b> <span class="bt-pill" style="background:#5865f2;color:#fff">BOT</span>
    <div class="bt-emb" style="border-left-color:${esc(bGet('messages.bienvenue.couleur', '#5865F2'))}">${bGet('messages.bienvenue.titre', '') ? `<b>${rem(bGet('messages.bienvenue.titre'))}</b>` : ''}<div>${rem(bGet('messages.bienvenue.desc', ''))}</div>
    ${bGet('messages.bienvenue.pied', '') ? `<div class="mut sm" style="margin-top:6px">${rem(bGet('messages.bienvenue.pied'))}</div>` : ''}
    ${btn.length ? `<div class="bt-row" style="margin-top:8px">${btn.map(b => `<span class="bt-dbtn">${esc(b.label || 'Lien')}</span>`).join('')}</div>` : ''}</div></div>`;
}
function bBtnSet(i, k, v) { const b = bGet('messages.bienvenue.boutons', []).slice(); b[i] = { ...b[i], [k]: v }; bSet('messages.bienvenue.boutons', b); botRender(); }
function bBtnAdd() { const b = bGet('messages.bienvenue.boutons', []).slice(); if (b.length >= 5) return toast('5 boutons au maximum'); b.push({ label: '', url: 'https://' }); bSet('messages.bienvenue.boutons', b); botRender(); }
function bBtnDel(i) { bSet('messages.bienvenue.boutons', bGet('messages.bienvenue.boutons', []).filter((_, k) => k !== i)); botRender(); }
function botMsgs() {
  const btn = bGet('messages.bienvenue.boutons', []);
  const ret = ((S.botcfg || {}).retours || []).slice(-5).reverse();
  return `<div class="grid g2" style="grid-template-columns:1.2fr 1fr">
  <div class="panel"><div class="bt-row" style="margin-bottom:12px"><h3 style="margin:0">👋 Message de bienvenue</h3><span class="sp"></span>${bSw('messages.bienvenue.on', true, !bPeut())}</div>
    <div class="hint" style="margin-bottom:10px">Tant que ce message est vide, le bot garde son message d’origine.</div>
    <div class="grid g2"><div class="bt-field"><div class="lbl">Salon</div>${bSalonSel('messages.bienvenue.salon')}</div><div class="bt-field"><div class="lbl">Couleur</div><div class="bt-row"><input type="color" value="${esc(bGet('messages.bienvenue.couleur', '#5865F2'))}" onchange="bSetV('messages.bienvenue.couleur',this.value,'s')" style="width:46px;height:36px;border:0;background:none">${bTxt('messages.bienvenue.couleur', '#5865F2', 110)}</div></div></div>
    <div class="bt-field"><div class="lbl">Titre</div>${bTxt('messages.bienvenue.titre', '🛢️ Bienvenue chez Oil Roxwood !')}</div>
    <div class="bt-field"><div class="lbl">Texte</div><textarea class="field" rows="5" onchange="bSetV('messages.bienvenue.desc',this.value,'s')" placeholder="Hey {membre}, ravis de t’accueillir !">${esc(bGet('messages.bienvenue.desc', ''))}</textarea>
      <div class="bt-chips" style="margin-top:6px">${BOT_VARS.map(v => `<span class="bt-chip bt-var" onclick="bVarIns('${v}')">${v}</span>`).join('')}</div></div>
    <div class="grid g2"><div class="bt-field"><div class="lbl">Image (adresse)</div>${bTxt('messages.bienvenue.image', 'https://…')}</div><div class="bt-field"><div class="lbl">Pied de page</div>${bTxt('messages.bienvenue.pied', 'Oil Roxwood · Roxwood County')}</div></div>
    <div class="lbl">Boutons-liens</div>${btn.map((b, i) => `<div class="bt-row" style="margin-bottom:6px"><input class="field" style="width:150px" placeholder="Texte" value="${esc(b.label || '')}" onchange="bBtnSet(${i},'label',this.value)"><input class="field" style="flex:1" placeholder="https://…" value="${esc(b.url || '')}" onchange="bBtnSet(${i},'url',this.value)"><button class="btn btn-red btn-sm" onclick="bBtnDel(${i})">✕</button></div>`).join('')}
    <button class="btn btn-ghost btn-sm" onclick="bBtnAdd()">＋ Ajouter un bouton</button></div>
  <div><div class="panel"><h3>👁 Aperçu</h3>${bMsgPreview()}
    <div class="bt-row" style="margin-top:12px"><button class="btn btn-ghost" ${bPeut() && bGet('messages.bienvenue.salon', '') && !bDirty() ? '' : 'disabled'} onclick="botAction({type:'test_bienvenue',salon:bGet('messages.bienvenue.salon',''),par_did:(currentUser()||{}).did||''})">🧪 Envoyer un test dans le salon</button></div>
    <div class="hint">Enregistre d’abord : le test utilise les réglages déjà appliqués.</div></div>
  <div class="panel" style="margin-top:16px"><h3>📣 Envoyer un message maintenant</h3>
    <div class="bt-field"><div class="lbl">Salon</div><select class="field" id="btEnvSalon">${bSalonOpts('')}</select></div>
    <div class="bt-field"><div class="lbl">Titre (facultatif — en fait une carte)</div><input class="field" id="btEnvTitre"></div>
    <div class="bt-field"><div class="lbl">Message</div><textarea class="field" id="btEnvTxt" rows="3" placeholder="Réunion générale ce soir à 21h…"></textarea></div>
    <button class="btn btn-gold" ${bPeut() ? '' : 'disabled'} onclick="botEnvoyer()">📨 Envoyer</button>
    ${ret.length ? `<div class="lbl" style="margin-top:12px">Réponses du bot</div>${ret.map(r => `<div class="bt-li"><span class="bt-pill ${r.ok ? 'ok' : 'ko'}">${r.ok ? 'OK' : 'Échec'}</span><span class="sm">${esc(r.txt)} · ${bIlYa(r.t)}</span></div>`).join('')}` : ''}</div></div></div>`;
}
function bVarIns(v) { const t = document.querySelector('textarea[onchange*="bienvenue.desc"]'); if (!t) return; t.value += v; bSetV('messages.bienvenue.desc', t.value, 's'); }
function botEnvoyer() {
  const salon = $('#btEnvSalon').value, txt = $('#btEnvTxt').value.trim(), titre = $('#btEnvTitre').value.trim();
  if (!salon || !(txt || titre)) return toast('⚠️ Choisis un salon et écris un message');
  if (!confirm('Envoyer ce message dans ' + bNomSalon(salon) + ' ?')) return;
  botAction({ type: 'envoyer', salon, texte: txt, titre });
}

/* ---------- 6. Annonces programmées ---------- */
function botAuto() {
  const pl = bGet('planifs', []), off = !bPeut();
  return `<div class="panel"><div class="bt-row" style="margin-bottom:10px"><h3 style="margin:0">⏰ Annonces programmées</h3><span class="sp"></span><button class="btn btn-gold btn-sm" ${off ? 'disabled' : ''} onclick="bPlanAjoute()">＋ Nouvelle annonce</button></div>
  <div class="hint" style="margin-bottom:12px">Le bot poste le message au jour et à l’heure choisis (heure de Paris), une fois par jour. Si le bot était éteint, il rattrape jusqu’à 20 minutes de retard.</div>
  ${pl.length ? pl.map((p, i) => `<div class="bt-plan${p.on === false ? ' bt-off' : ''}">
    <div class="bt-row"><input class="field" style="flex:1;font-weight:700" value="${esc(p.nom || '')}" placeholder="Nom de l’annonce" onchange="bSetV('planifs.${i}.nom',this.value,'s')">${bSw('planifs.' + i + '.on', true, off)}<button class="btn btn-red btn-sm" ${off ? 'disabled' : ''} onclick="bPlanDel(${i})">✕</button></div>
    <div class="bt-row" style="margin:8px 0">${BOT_JOURS.map((j, k) => `<button type="button" class="bt-jour${(p.jours || []).includes(k) ? ' on' : ''}" onclick="bPlanJour(${i},${k})">${j}</button>`).join('')}
      <input class="field" type="time" style="width:110px" value="${esc(p.heure || '20:00')}" onchange="bSetV('planifs.${i}.heure',this.value,'s')">${bSalonSel('planifs.' + i + '.salon', 220)}</div>
    <input class="field" style="margin-bottom:6px" placeholder="Titre (facultatif — en fait une carte)" value="${esc(p.titre || '')}" onchange="bSetV('planifs.${i}.titre',this.value,'s')">
    <textarea class="field" rows="2" placeholder="Message…" onchange="bSetV('planifs.${i}.texte',this.value,'s')">${esc(p.texte || '')}</textarea></div>`).join('') : '<div class="empty">Aucune annonce programmée.</div>'}</div>`;
}
function bPlanAjoute() { const pl = bGet('planifs', []).slice(); pl.push({ id: bUid('p'), nom: 'Nouvelle annonce', on: true, jours: [4], heure: '20:00', salon: '', texte: '' }); bSet('planifs', pl); botRender(); }
function bPlanDel(i) { if (!confirm('Supprimer cette annonce ?')) return; bSet('planifs', bGet('planifs', []).filter((_, k) => k !== i)); botRender(); }
function bPlanJour(i, k) { const j = (bGet('planifs.' + i + '.jours', [])).slice(); bSet('planifs.' + i + '.jours', j.includes(k) ? j.filter(x => x !== k) : j.concat([k]).sort()); botRender(); }

/* ---------- 7. Modération ---------- */
function botMod() {
  const off = !bPeut(), sa = bGet('moderation.sanctions', []);
  const F = (p, ico, nom, aide, extra) => `<div class="bt-mod"><div class="bt-ico">${ico}</div><div class="sp"><b>${nom}</b><div class="mut sm">${aide}</div></div>${extra || ''}${bSw('moderation.filtres.' + p + '.on', false, off)}</div>`;
  return `<div class="bt-note">Ces filtres suppriment le message fautif et préviennent la personne. Le staff et les rôles/salons exemptés ne sont jamais touchés. Tout est éteint tant que tu n’as rien allumé.</div>
  <div class="grid g2">
  <div class="panel"><h3>🛡️ Anti-spam & filtres</h3>
    <div class="bt-mod"><div class="bt-ico">🔁</div><div class="sp"><b>Messages identiques répétés</b><div class="mut sm">Supprime et met en sourdine</div></div>${bSw('moderation.spam.on', true, off)}</div>
    <div class="bt-row" style="margin:0 0 12px 46px">${bNum('moderation.spam.n', 4, 'messages', 60)}${bNum('moderation.spam.secondes', 10, 's', 60)}${bNum('moderation.spam.minutes', 10, 'min de mute', 60)}</div>
    ${F('mentions', '📣', 'Mentions de masse', 'Trop de mentions dans un message', bNum('moderation.filtres.mentions.n', 5, 'max', 60))}
    ${F('liens', '🔗', 'Liens externes', 'Sauf adresses de la liste blanche')}
    <div style="margin:0 0 10px 46px"><textarea class="field" rows="2" placeholder="Liste blanche (youtube.com, discord.com…)" onchange="bSetV('moderation.filtres.liens.blanche',this.value,'l')">${esc(bGet('moderation.filtres.liens.blanche', []).join(', '))}</textarea></div>
    ${F('invitations', '✉️', 'Invitations Discord', 'Supprimées automatiquement')}
    ${F('majuscules', '🔠', 'Majuscules abusives', 'Au-delà de ce pourcentage de lettres', bNum('moderation.filtres.majuscules.pct', 70, '%', 60))}
    ${F('mots', '🚫', 'Mots interdits', 'Un mot par ligne ou séparés par une virgule')}
    <div style="margin:0 0 4px 46px"><textarea class="field" rows="3" onchange="bSetV('moderation.filtres.mots.liste',this.value,'l')">${esc(bGet('moderation.filtres.mots.liste', []).join(', '))}</textarea></div></div>
  <div><div class="panel"><h3>⚖️ Sanctions graduées</h3>
    <div class="hint" style="margin-bottom:8px">Selon le nombre d’infractions sur 30 jours (filtres ci-contre). Vide = juste la suppression du message.</div>
    ${sa.length ? `<table><thead><tr><th>À partir de</th><th>Sanction</th><th>Durée</th><th></th></tr></thead>${sa.map((s, i) => `<tr><td>${bNum('moderation.sanctions.' + i + '.n', 1, '', 56)}</td><td><select class="field" onchange="bSetV('moderation.sanctions.${i}.action',this.value,'s')">${[['avert', '⚠️ Avertissement'], ['mute', '🔇 Mute'], ['exclusion', '⏳ Exclusion temporaire'], ['kick', '👢 Expulsion'], ['ban', '🔨 Bannissement']].map(o => `<option value="${o[0]}"${s.action === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></td><td>${['mute', 'exclusion'].includes(s.action) ? bNum('moderation.sanctions.' + i + '.minutes', 10, 'min', 60) : '—'}</td><td><button class="btn btn-red btn-sm" onclick="bSancDel(${i})">✕</button></td></tr>`).join('')}</table>` : ''}
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" ${off ? 'disabled' : ''} onclick="bSancAdd()">＋ Ajouter un palier</button>
    ${sa.some(s => s.action === 'ban' || s.action === 'kick') ? '<div class="bt-note" style="margin-top:10px">⚠️ Un palier expulsion ou bannissement agit sans validation humaine.</div>' : ''}
    <div class="bt-field" style="margin-top:12px"><div class="lbl">Rôles exemptés</div>${bMulti('moderation.exemptRoles', 'role')}</div>
    <div class="bt-field"><div class="lbl">Salons exemptés</div>${bMulti('moderation.exemptSalons', 'salon')}</div>
    <div class="bt-field"><div class="lbl">Salon des logs de modération</div>${bSalonSel('moderation.salonLogs')}</div></div>
  <div class="panel" style="margin-top:16px"><h3>🚪 Arrivées & sécurité</h3>
    <div class="bt-mod"><div class="sp"><b>Anti-raid</b><div class="mut sm">Alerte si trop d’arrivées d’un coup</div></div>${bSw('moderation.raid.on', false, off)}</div>
    <div class="bt-row" style="margin:0 0 6px">${bNum('moderation.raid.n', 8, 'arrivées', 60)}${bNum('moderation.raid.secondes', 60, 's', 60)}${bSalonSel('moderation.raid.salon', 190)}</div>
    <div class="bt-mod"><div class="sp"><b>Compte trop récent</b><div class="mut sm">Prévient (ou expulse) les comptes de moins de N jours</div></div>${bSw('moderation.recent.on', false, off)}</div>
    <div class="bt-row">${bNum('moderation.recent.jours', 7, 'jours', 60)}<select class="field" onchange="bSetV('moderation.recent.action',this.value,'s')"><option value="alerter"${bGet('moderation.recent.action', 'alerter') === 'alerter' ? ' selected' : ''}>Prévenir seulement</option><option value="expulser"${bGet('moderation.recent.action', '') === 'expulser' ? ' selected' : ''}>Expulser</option></select>${bSalonSel('moderation.recent.salon', 190)}</div></div></div></div>`;
}
function bSancAdd() { const s = bGet('moderation.sanctions', []).slice(); s.push({ n: (s.length ? +s[s.length - 1].n + 1 : 1), action: 'avert', minutes: 10 }); bSet('moderation.sanctions', s); botRender(); }
function bSancDel(i) { bSet('moderation.sanctions', bGet('moderation.sanctions', []).filter((_, k) => k !== i)); botRender(); }

/* ---------- 8. Messages supprimés / modifiés ---------- */
function bMsgCle() { try { return localStorage.getItem('orx_botkey') || ''; } catch (e) { return ''; } }
function bB64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function botDechiffrer(p, mdp) {
  const enc = new TextEncoder(), sub = crypto.subtle;
  const base = await sub.importKey('raw', enc.encode(mdp), 'PBKDF2', false, ['deriveBits']);
  const k = new Uint8Array(await sub.deriveBits({ name: 'PBKDF2', salt: enc.encode('oilroxwood-msg-v1'), iterations: 100000, hash: 'SHA-256' }, base, 512));
  const ke = await sub.importKey('raw', k.slice(0, 32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const km = await sub.importKey('raw', k.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const iv = bB64(p.iv), ct = bB64(p.ct), tag = bB64(p.tag);
  const cat = new Uint8Array(iv.length + ct.length); cat.set(iv); cat.set(ct, iv.length);
  const att = new Uint8Array(await sub.sign('HMAC', km, cat));
  if (att.length !== tag.length || att.some((x, i) => x !== tag[i])) throw new Error('mot de passe incorrect');
  const out = new Uint8Array(ct.length);
  for (let off = 0, c = 0; off < ct.length; off += 32, c++) {
    const blk = new Uint8Array(20); blk.set(iv); new DataView(blk.buffer).setUint32(16, c);
    const ks = new Uint8Array(await sub.sign('HMAC', ke, blk));
    for (let i = 0; i < 32 && off + i < ct.length; i++) out[off + i] = ct[off + i] ^ ks[i];
  }
  return new TextDecoder().decode(out);
}
async function botMsgOuvrir(silencieux) {
  BOT_MSG_ERR = ''; const mdp = bMsgCle();
  if (!BOT_MSG) return;
  if (!mdp) { BOT_MSG_ERR = 'cle'; return; }
  try { BOT_MSG_LIGNES = JSON.parse(await botDechiffrer(BOT_MSG, mdp)); }
  catch (e) { BOT_MSG_LIGNES = null; BOT_MSG_ERR = 'mdp'; }
  if (!silencieux) botRender();
}
function botMsgCle() { const v = $('#btCle').value; try { localStorage.setItem('orx_botkey', v); } catch (e) { } botMsgOuvrir(false); }
function bMsgNombres(t) { return (String(t || '').match(/\d[\d\s.,]*/g) || []).map(x => x.replace(/\D/g, '')).filter(Boolean).join('|'); }
function bMsgClasse(e) {
  const m = bGet('msglog.marques', {})[e.mid];
  if (m === 'imp') return { c: 'imp', r: 'Marqué ⭐' };
  if (m === 'ign') return { c: 'ign', r: 'Ignoré' };
  const L = bGet('msglog', {}), txt = ((e.avant || '') + ' ' + (e.apres || '')).toLowerCase();
  const modif = e.type === 'modif', norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
  /* « toujours garder » passe avant « toujours ignorer » : une règle de garde est une volonté explicite */
  if ((L.gardeSalons || []).includes(e.cid)) return { c: 'imp', r: 'Salon surveillé' };
  const mot = (L.gardeMots || []).find(w => w && txt.includes(String(w).toLowerCase()));
  if (mot) return { c: 'imp', r: 'Mot-clé : ' + mot };
  if (L.gardeMontants && modif && bMsgNombres(e.avant) !== bMsgNombres(e.apres) && bMsgNombres(e.avant)) return { c: 'imp', r: 'Chiffre modifié' };
  if ((L.persIgnorees || []).includes(e.uid)) return { c: 'ign', r: 'Personne ignorée' };
  if ((L.salonsIgnores || []).includes(e.cid)) return { c: 'ign', r: 'Salon ignoré' };
  if (modif && L.modif === 'tout') return { c: 'ign', r: 'Modifications ignorées' };
  if (modif && L.modif === 'petites' && (norm(e.avant) === norm(e.apres) || Math.abs((e.avant || '').length - (e.apres || '').length) <= 3 && (e.apres || '').length < 40)) return { c: 'ign', r: 'Petite modification' };
  if (!modif && L.suppr === 'tout') return { c: 'ign', r: 'Suppressions ignorées' };
  if (!modif && L.suppr === 'courtes' && (e.avant || '').length < 10) return { c: 'ign', r: 'Message court' };
  if (L.minLen && (e.avant || '').length < L.minLen && !modif) return { c: 'ign', r: 'Message court' };
  return L.seulImportant ? { c: 'ign', r: 'Masqué (mode « important seulement »)' } : { c: 'trier', r: '' };
}
function bMsgMarque(mid, v) { const m = { ...bGet('msglog.marques', {}) }; if (m[mid] === v) delete m[mid]; else m[mid] = v; bSet('msglog.marques', m); botRender(); }
function bMsgPers(uid) { bAdd('msglog.persIgnorees', uid); toast('🔇 Cette personne est maintenant ignorée'); }
function bHeureMsg(t) { const d = new Date(t * 1000); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function botJmsg() {
  const off = !bPeut(), L = bGet('msglog', {});
  const lignes = (BOT_MSG_LIGNES || []).map(e => ({ ...e, k: bMsgClasse(e) }));
  const cnt = { imp: 0, trier: 0, ign: 0 }; lignes.forEach(e => cnt[e.k.c]++);
  const q = BOT_MSG_Q.toLowerCase();
  const vue = lignes.filter(e => (BOT_MSG_TAB === 'tout' || e.k.c === BOT_MSG_TAB) && (!q || (e.avant + ' ' + e.apres + ' ' + e.auteur + ' ' + e.salon).toLowerCase().includes(q))).sort((a, b) => b.t - a.t).slice(0, 80);
  const carte = e => `<div class="bt-msg${e.k.c === 'imp' ? ' imp' : ''}"><div class="bt-row" style="flex-wrap:wrap"><div class="bt-ico" style="width:30px;height:30px">${esc((e.auteur || '?')[0])}</div><b>${esc(e.auteur)}</b><span class="mut sm">dans #${esc(e.salon)}</span>
    <span class="bt-pill ${e.type === 'suppr' ? 'ko' : 'g'}">${e.type === 'suppr' ? '🗑️ Supprimé' : '✏️ Modifié'}</span>${e.k.r ? `<span class="bt-pill">${esc(e.k.r)}</span>` : ''}<span class="sp"></span><span class="mut sm">${bHeureMsg(e.t)}</span></div>
    ${e.type === 'suppr' ? `<div class="bt-avant">${esc(e.avant) || '<i>(pièce jointe seule)</i>'}${(e.pj || []).length ? `<div class="mut sm">📎 ${esc(e.pj.join(', '))}</div>` : ''}</div>`
      : `<div class="grid g2" style="margin-top:6px"><div><div class="lbl">Avant</div><div class="bt-avant">${esc(e.avant)}</div></div><div><div class="lbl">Après</div><div class="bt-apres">${esc(e.apres)}</div></div></div>`}
    <div class="bt-row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" ${off ? 'disabled' : ''} onclick="bMsgMarque('${e.mid}','imp')">${bGet('msglog.marques', {})[e.mid] === 'imp' ? '⭐ Important (retirer)' : '⭐ Important'}</button>
      <button class="btn btn-ghost btn-sm" ${off ? 'disabled' : ''} onclick="bMsgMarque('${e.mid}','ign')">${bGet('msglog.marques', {})[e.mid] === 'ign' ? '↩ Ne plus ignorer' : '🙈 Ignorer'}</button>
      <button class="btn btn-ghost btn-sm" ${off ? 'disabled' : ''} onclick="bMsgPers('${esc(e.uid)}')">🔇 Ignorer ${esc((e.auteur || '').split(' ')[0])}</button></div></div>`;
  const etat = BOT_ST && BOT_ST.msglog ? BOT_ST.msglog.etat : '';
  const sel = (p, opts) => `<select class="field" onchange="bSetV('${p}',this.value,'s')">${opts.map(o => `<option value="${o[0]}"${bGet(p, opts[0][0]) === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  return `<div class="bt-note">🔒 Le dépôt GitHub est public : le texte des messages n’y est <b>jamais</b> en clair. Le bot le chiffre avec un mot de passe (<code>ORX_MSG_KEY</code> dans <code>cogs/.env</code>) et ton navigateur le déchiffre ici. Le bot ne garde que ce qu’il a vu passer depuis l’activation : impossible de retrouver un message supprimé avant.</div>
  <div class="panel" style="margin-bottom:16px"><div class="bt-row" style="flex-wrap:wrap"><h3 style="margin:0">🎚️ Journalisation</h3><span class="sp"></span><span class="mut sm">${etat === 'cle_manquante' ? '⚠️ Clé manquante sur le serveur' : etat === 'actif' ? '🟢 active' : 'éteinte'}</span>${bSw('msglog.on', false, off)}</div>
    <div class="grid g3" style="margin-top:12px">
      <div class="bt-field"><div class="lbl">✏️ Modifications</div>${sel('msglog.modif', [['garder', 'Garder'], ['petites', 'Ignorer les petites (fautes…)'], ['tout', 'Tout ignorer']])}</div>
      <div class="bt-field"><div class="lbl">🗑️ Suppressions</div>${sel('msglog.suppr', [['garder', 'Garder'], ['courtes', 'Ignorer les courtes'], ['tout', 'Tout ignorer']])}</div>
      <div class="bt-field"><div class="lbl">🎯 Ne garder que l’important</div><div class="bt-row">${bSw('msglog.seulImportant', false, off)}<span class="hint">Le reste va dans « Ignorés ».</span></div></div></div></div>
  <div class="panel" style="margin-bottom:16px"><h3>🔓 Déchiffrement</h3>
    <div class="bt-row"><input class="field" id="btCle" type="password" style="max-width:300px" placeholder="Mot de passe du journal (ORX_MSG_KEY)" value="${esc(bMsgCle())}"><button class="btn btn-gold" onclick="botMsgCle()">Déchiffrer</button>
      <span class="mut sm">${BOT_MSG ? `${BOT_MSG.n} message(s) publié(s) · ${bIlYa(BOT_MSG.t)}` : 'Aucun journal publié par le bot pour l’instant.'}</span></div>
    ${BOT_MSG_ERR === 'mdp' ? '<div class="hint" style="color:#E39B98;margin-top:6px">Mot de passe incorrect.</div>' : ''}<div class="hint" style="margin-top:6px">Gardé sur cet appareil seulement, jamais envoyé nulle part.</div></div>
  ${BOT_MSG_LIGNES ? `<div class="panel"><div class="bt-row" style="margin-bottom:12px;flex-wrap:wrap"><div class="bt-tabs" style="margin:0">${[['imp', '⭐ Importants', cnt.imp], ['trier', 'À trier', cnt.trier], ['ign', '🙈 Ignorés', cnt.ign], ['tout', 'Tout', lignes.length]].map(t => `<button class="bt-tab${BOT_MSG_TAB === t[0] ? ' on' : ''}" onclick="BOT_MSG_TAB='${t[0]}';botRender()">${t[1]} · ${t[2]}</button>`).join('')}</div><span class="sp"></span>
      <input class="field" style="max-width:240px" placeholder="🔎 Rechercher…" value="${esc(BOT_MSG_Q)}" oninput="BOT_MSG_Q=this.value;clearTimeout(window._bmq);window._bmq=setTimeout(botRender,250)"></div>
    ${vue.length ? vue.map(carte).join('') : '<div class="empty">Rien dans cette liste.</div>'}${vue.length === 80 ? '<div class="hint">80 premiers résultats — affine la recherche.</div>' : ''}</div>` : ''}
  <div class="grid g2" style="margin-top:16px"><div class="panel"><h3>📌 Toujours garder</h3>
    <div class="bt-field"><div class="lbl">Salons surveillés</div>${bMulti('msglog.gardeSalons', 'salon')}</div>
    <div class="bt-field"><div class="lbl">Mots-clés</div><textarea class="field" rows="2" onchange="bSetV('msglog.gardeMots',this.value,'l')">${esc((L.gardeMots || []).join(', '))}</textarea></div>
    <div class="bt-li"><div><b>Chiffres modifiés</b><div class="mut sm">Un montant qui change dans un message est marqué important</div></div><span class="sp"></span>${bSw('msglog.gardeMontants', false, off)}</div></div>
  <div class="panel"><h3>🙈 Toujours ignorer</h3>
    <div class="bt-field"><div class="lbl">Salons ignorés</div>${bMulti('msglog.salonsIgnores', 'salon')}</div>
    <div class="bt-field"><div class="lbl">Messages plus courts que</div><div class="bt-row">${bNum('msglog.minLen', 0, 'caractères', 70)}</div></div>
    <div class="bt-li"><div><b>Messages de bots</b><div class="mut sm">Ne rien journaliser pour les bots</div></div><span class="sp"></span>${bSw('msglog.ignorerBots', true, off)}</div>
    <div class="bt-field" style="margin-top:8px"><div class="lbl">Conservation</div><div class="bt-row">${bNum('msglog.conservation', 30, 'jours', 70)}<span class="hint">Les messages ⭐ ne sont jamais supprimés.</span></div></div>
    <div class="bt-li"><div><b>Alerte en cas de rafale</b><div class="mut sm">Prévient si quelqu’un supprime beaucoup de messages en 1 minute</div></div><span class="sp"></span>${bSw('msglog.alerte.on', false, off)}</div>
    <div class="bt-row">${bNum('msglog.alerte.n', 5, 'messages', 60)}<span class="hint">Salon : onglet « Salons & rôles »</span></div></div></div>`;
}

/* ---------- 9. Statistiques par semaine ---------- */
function bSemaines() {
  const d = (BOT_STATS && BOT_STATS.semaines) || [], map = {}; d.forEach(x => map[x.d] = x);
  const cur = lundiCourant(), out = [];
  for (let i = 11; i >= 0; i--) { const dt = new Date(cur + 'T12:00:00'); dt.setDate(dt.getDate() - 7 * i); const k = dt.toISOString().slice(0, 10); out.push(map[k] || { d: k, cmd: 0, bidons: 0, cand: 0, acc: 0, ref: 0 }); }
  return out;
}
function bBarres(vals, labels, col, hi, h) {
  const m = Math.max(1, ...vals);
  return `<div class="bt-bars">${vals.map((v, i) => `<div class="bt-b"><span>${v}</span><i style="height:${Math.max(3, Math.round(v / m * (h || 110)))}px;background:${i === hi ? 'linear-gradient(180deg,#fff2c8,#F7C463)' : col}"></i><em>${labels[i]}</em></div>`).join('')}</div>`;
}
function botStats() {
  if (!BOT_STATS) return '<div class="panel"><div class="empty">Le bot n’a pas encore publié ses statistiques (elles arrivent environ 2 minutes après son redémarrage avec le nouveau fichier).</div></div>';
  const sem = bSemaines(), n = sem.length, p = BOT_STAT_P;
  const idx = p === 'prec' ? n - 2 : n - 1, fen = p === '4' ? sem.slice(-4) : p === '12' ? sem : p === 'tout' ? ((BOT_STATS.semaines) || []) : [sem[idx]];
  const som = k => fen.reduce((a, x) => a + (+x[k] || 0), 0), moy = k => Math.round(sem.reduce((a, x) => a + x[k], 0) / sem.length * 10) / 10;
  const prev = sem[idx - 1] || { cmd: 0, cand: 0 }, cur = sem[idx];
  const dlt = (a, b) => `<span class="bt-pill ${a >= b ? 'ok' : 'ko'}">${a >= b ? '▲' : '▼'} ${Math.abs(a - b)} vs sem. préc.</span>`;
  const lab = sem.map(x => x.d.slice(8, 10) + '/' + x.d.slice(5, 7)), hi = n - 1;
  const rec = Math.max(...sem.map(x => x.cmd)), recC = Math.max(...sem.map(x => x.cand));
  const K = (l, v, c) => `<div><div class="lbl">${l}</div><div class="val" style="${c || ''}">${v}</div></div>`;
  const unique = ['sem', 'prec'].includes(p);
  return `<div class="bt-row" style="margin-bottom:14px;flex-wrap:wrap"><div class="bt-tabs" style="margin:0">${[['sem', 'Semaine en cours'], ['prec', 'Semaine dernière'], ['4', '4 semaines'], ['12', '12 semaines'], ['tout', 'Depuis le début']].map(t => `<button class="bt-tab${p === t[0] ? ' on' : ''}" onclick="BOT_STAT_P='${t[0]}';botRender()">${t[1]}</button>`).join('')}</div><span class="sp"></span><span class="mut sm">Semaines du lundi au dimanche · mis à jour ${bIlYa(BOT_STATS.t)}</span></div>
  <div class="grid g2"><div class="panel"><h3>📦 Commandes clients · par semaine</h3><div class="bt-kpis">${K('Commandes', som('cmd'))}${K('Bidons', som('bidons').toLocaleString('fr-FR'))}${K('Moy. 12 sem.', moy('cmd'))}</div>
    ${unique ? `<div class="bt-row" style="margin:10px 0">${dlt(cur.cmd, prev.cmd)}<span class="mut sm">Record : ${rec} commandes</span></div>` : ''}
    <div class="lbl" style="margin-top:12px">Commandes par semaine</div>${bBarres(sem.map(x => x.cmd), lab, 'linear-gradient(180deg,#F7C463,#E8A020)', hi)}
    <div class="lbl" style="margin-top:12px">Bidons demandés</div>${bBarres(sem.map(x => x.bidons), lab, 'linear-gradient(180deg,#c98a1c,#8a5a10)', hi, 60)}</div>
  <div class="panel"><h3>👥 Recrutement · par semaine</h3><div class="bt-kpis">${K('Reçues', som('cand'))}${K('Acceptées', som('acc'), 'color:var(--green)')}${K('Refusées', som('ref'), 'color:var(--red)')}${K('Moy. 12 sem.', moy('cand'))}</div>
    ${unique ? `<div class="bt-row" style="margin:10px 0">${dlt(cur.cand, prev.cand)}<span class="mut sm">Record : ${recC} candidatures</span></div>` : ''}
    <div class="lbl" style="margin-top:12px">Candidatures reçues</div>${bBarres(sem.map(x => x.cand), lab, 'linear-gradient(180deg,#5aa0ff,#2f6fd0)', hi)}
    <div class="lbl" style="margin-top:12px">Acceptées</div>${bBarres(sem.map(x => x.acc), lab, 'linear-gradient(180deg,#6fd09b,#2f8a5a)', hi, 60)}</div></div>
  <div class="grid g3" style="margin-top:16px"><div class="panel"><h3>📋 Semaine par semaine</h3><table><thead><tr><th>Semaine</th><th>Cmd</th><th>Bidons</th><th>Cand.</th><th>Acc.</th></tr></thead>${sem.slice().reverse().slice(0, 8).map(x => `<tr><td>${x.d.slice(8, 10)}/${x.d.slice(5, 7)}</td><td>${x.cmd}</td><td>${(+x.bidons).toLocaleString('fr-FR')}</td><td>${x.cand}</td><td>${x.acc}</td></tr>`).join('')}</table><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="botStatsCsv()">⬇ Exporter en CSV</button></div>
    <div class="panel"><h3>⏱️ Délais (30 jours)</h3><table><tr><td>Candidature → décision</td><td class="gold">${BOT_STATS.delai_moy_j != null ? BOT_STATS.delai_moy_j + ' j' : '—'}</td></tr><tr><td>Plus lente à traiter</td><td class="gold">${BOT_STATS.delai_max_j != null ? BOT_STATS.delai_max_j + ' j' : '—'}</td></tr></table>
      <h3 style="margin-top:16px">Total depuis le début</h3><div class="mut sm">${BOT_STATS.commandes ? `${BOT_STATS.commandes.total} commandes · ${(BOT_STATS.commandes.bidons || 0).toLocaleString('fr-FR')} bidons` : ''}<br>${Object.entries(BOT_STATS.statuts || {}).map(([k, v]) => `${v} ${({ accepted: 'acceptées', refused: 'refusées', pending: 'en attente', entretien: 'en entretien', closed: 'fermées' })[k] || k}`).join(' · ')}</div></div>
    <div class="panel"><h3>🏅 Qui recrute le plus (12 sem.)</h3>${(BOT_STATS.recruteurs || []).length ? (() => { const mx = Math.max(1, ...BOT_STATS.recruteurs.map(r => r.n)); return BOT_STATS.recruteurs.map(r => `<div class="bt-bar"><span>${esc(r.nom)}</span><div class="bt-barv"><i style="width:${Math.round(r.n / mx * 100)}%"></i></div><b>${r.n}</b></div>`).join(''); })() : '<div class="empty">Pas de données.</div>'}</div></div>`;
}
function botStatsCsv() {
  const l = ['semaine;commandes;bidons;candidatures;acceptees;refusees'].concat(((BOT_STATS && BOT_STATS.semaines) || []).map(x => [x.d, x.cmd, x.bidons, x.cand, x.acc, x.ref].join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'stats-bot-semaines.csv'; a.click();
}

/* ---------- 10. Alertes & outils ---------- */
function botOutils() {
  const off = !bPeut();
  return `<div class="grid g2"><div class="panel"><h3>🔔 Alertes envoyées sur Discord</h3>
    <div class="bt-mod"><div class="sp"><b>Stock sous le seuil</b><div class="mut sm">Un message quand un produit de « Gestion des stocks » passe sous son seuil (une fois par passage)</div></div>${bSw('alertes.stock.on', false, off)}</div>
    <div class="bt-field"><div class="lbl">Salon</div>${bSalonSel('alertes.stock.salon')}</div>
    <div class="hint">D’autres alertes (bot hors ligne, factures impayées…) viendront quand le bot saura les détecter lui-même.</div></div>
  <div class="panel"><h3>🧰 Outils</h3>
    <div class="bt-li"><div><b>Mode maintenance</b><div class="mut sm">Seul le staff peut utiliser les commandes</div></div><span class="sp"></span>${bSw('maintenance', false, off)}</div>
    <div class="bt-row" style="margin:12px 0"><button class="btn btn-ghost" onclick="botCharger(true);toast('Actualisé')">🔄 Actualiser l’état</button><button class="btn btn-ghost" ${off ? 'disabled' : ''} onclick="botAction({type:'sync'})">🔁 Resynchroniser les commandes</button></div>
    <div class="lbl">Redémarrer le bot</div><div class="hint">Le site ne peut pas le faire : à taper sur le serveur (PuTTY ou terminal WinSCP).</div>
    <div class="bt-code">systemctl restart botoilroxwood &amp;&amp; systemctl status botoilroxwood</div>
    <div class="lbl" style="margin-top:12px">Voir les logs du bot</div><div class="bt-code">journalctl -u botoilroxwood -n 100 --no-pager</div></div></div>`;
}

/* ---------- 11. Journal & versions ---------- */
function botJrn() {
  const h = ((S.botcfg || {}).historique || []).slice().reverse(), off = !bPeut();
  return `<div class="grid g2"><div class="panel"><h3>📜 Versions des réglages</h3>
    ${h.length ? h.map((x, i) => `<div class="bt-li"><div style="min-width:0"><b>Version ${x.v}</b>${i === 0 ? ' <span class="bt-pill ok">en place</span>' : ''}<div class="mut sm">${new Date(x.t).toLocaleString('fr-FR')} · ${esc(x.par || '?')} · ${x.n} réglage(s)</div><div class="mut sm" style="word-break:break-all">${(x.ch || []).map(c => esc(c)).join(' · ')}</div></div><span class="sp"></span>${i === 0 ? '' : `<button class="btn btn-ghost btn-sm" ${off ? 'disabled' : ''} onclick="botRestaure(${x.v})">↩ Restaurer</button>`}</div>`).join('') : '<div class="empty">Aucune version enregistrée pour l’instant.</div>'}
    <div class="hint" style="margin-top:8px">« Restaurer » recharge les réglages de cette version dans le brouillon : rien n’est appliqué tant que tu n’as pas enregistré.</div></div>
  <div class="panel"><h3>📦 Export & import</h3><div class="hint" style="margin-bottom:10px">Sauvegarde de la configuration entière (hors messages marqués et historique), ou copie vers un autre serveur de test.</div>
    <div class="bt-row"><button class="btn btn-ghost" onclick="botExport()">⬇ Exporter (JSON)</button><button class="btn btn-ghost" ${off ? 'disabled' : ''} onclick="botImportModal()">⬆ Importer…</button></div>
    <h3 style="margin-top:20px">🧹 Réinitialiser</h3><div class="hint" style="margin-bottom:10px">Remet le bot à son comportement d’origine (tout ce que tu as réglé ici est retiré, dans le brouillon).</div>
    <button class="btn btn-red" ${off ? 'disabled' : ''} onclick="if(confirm('Tout remettre par défaut dans le brouillon ?')){BOT_D={};botRender()}">Tout remettre par défaut</button></div></div>`;
}
function botRestaure(v) { const x = ((S.botcfg || {}).historique || []).find(h => h.v === v); if (!x) return; BOT_D = bClone(x.snap); toast('Version ' + v + ' chargée dans le brouillon — pense à enregistrer'); BOT_TAB = 'apercu'; botRender(); }
function botExport() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(bStrip(BOT_D), null, 2)], { type: 'application/json' })); a.download = 'config-bot.json'; a.click(); }
function botImportModal() { openModal(`<h3>⬆ Importer une configuration</h3><p class="hint">Colle le JSON exporté. Il remplace le brouillon (rien n’est appliqué avant « Enregistrer »).</p><textarea class="field" id="btImp" rows="10" style="width:100%"></textarea><div class="bt-row" style="margin-top:12px"><button class="btn btn-gold" onclick="botImporter()">Importer</button><button class="btn btn-ghost" onclick="closeModal()">Annuler</button></div>`); }
function botImporter() { try { const o = JSON.parse($('#btImp').value); if (!o || typeof o !== 'object' || Array.isArray(o)) throw 0; BOT_HIDE.forEach(k => delete o[k]); BOT_D = o; closeModal(); toast('Importé dans le brouillon'); botRender(); } catch (e) { toast('⚠️ JSON invalide'); } }
