/* OIL ROXWOOD — commande de bidons d'essence depuis le site.
   Même principe que la candidature directe (roxwood-postuler.js) : le formulaire dépose la commande dans un salon privé
   de Discord (webhook) ; le bot (cogs/commande_site.py) ouvre le ticket commande du client, grâce à son ID Discord, avec
   les mêmes informations que son bouton « Nouvelle commande ».

   Réglage : window.ROXWOOD_SITE.webhookCommande (voir index.html). Vide = le bouton renvoie simplement vers le Discord. */
(function () {
  var CFG = window.ROXWOOD_SITE || {};
  var INVITE = CFG.discordInvite || "https://discord.com/invite/99AuEX3Kpz";
  var HOOK = String(CFG.webhookCommande || "").trim();
  var PRIX_HT = 180;                          // $ HT par bidon (même tarif que la section « Devenir client »)
  var ATTENTE_MIN = 10;
  var CLE_LAST = "orx_commande_t";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  var fond = null;

  function champ(id, label, ph, type, attrs, apres) {
    return '<div class="pst-champ"><label for="' + id + '">' + label + '</label>' +
           '<input id="' + id + '" type="' + type + '" placeholder="' + ph + '" ' + attrs + '>' + (apres || "") + '</div>';
  }

  function construire() {
    if (fond) return fond;
    var aujourdhui = new Date().toISOString().slice(0, 10);
    fond = document.createElement("div");
    fond.id = "commander";
    fond.className = "pst-fond";
    fond.setAttribute("role", "dialog");
    fond.setAttribute("aria-modal", "true");
    fond.setAttribute("aria-labelledby", "cmdTitre");
    fond.hidden = true;
    fond.innerHTML =
      '<div class="pst-boite">' +
        '<button type="button" class="pst-fermer" aria-label="Fermer">✕</button>' +
        '<div class="pst-entete"><span class="pst-kicker">Entreprises &amp; familles · Oil Roxwood</span>' +
        '<h2 id="cmdTitre">Commander des <span class="creux">bidons</span></h2>' +
        '<p>Remplis ce formulaire : un ticket de commande s\'ouvre pour toi sur notre Discord, et un commercial le prend en charge.</p></div>' +
        '<div id="cmdEtape1">' +
          '<label class="pst-case"><input type="checkbox" id="cmdSurDiscord"> <span>Je suis déjà sur le Discord Oil Roxwood</span></label>' +
          '<div id="cmdRejoindre" class="pst-rejoindre">' +
            '<p>Pour que ton ticket de commande s\'ouvre à ton nom, tu dois d\'abord être membre de notre serveur Discord.</p>' +
            '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Rejoindre le Discord Oil Roxwood</span></a>' +
            '<p class="pst-note">Une fois dedans, reviens ici et coche la case ci-dessus.</p>' +
          '</div>' +
        '</div>' +
        '<form id="cmdForm" class="pst-form" novalidate hidden autocomplete="off">' +
          champ("cmdDiscord", "ID Discord", "Ex : 123456789012345678", "text", 'inputmode="numeric" maxlength="20" required',
                '<details class="pst-aide"><summary>Où trouver mon ID Discord ?</summary><ol>' +
                '<li>Discord → <b>Paramètres</b> → <b>Avancés</b> → active le <b>Mode développeur</b></li>' +
                '<li>Fais un <b>clic droit sur ton profil</b> (ton nom) → <b>Copier l\'identifiant</b></li>' +
                '<li>Colle-le ici (17 à 20 chiffres)</li></ol></details>') +
          champ("cmdNom", "Nom de l\'entreprise ou de la famille", "Ex : Burger Shot", "text", 'maxlength="100" required') +
          '<div class="pst-duo">' +
            champ("cmdTel", "Numéro de téléphone", "Ex : 555-0123", "text", 'maxlength="50" required') +
            champ("cmdQte", "Quantité (bidons)", "Ex : 50", "number", 'min="1" max="100000" step="1" inputmode="numeric" required') +
          '</div>' +
          '<div id="cmdEstim" class="pst-estim" aria-live="polite">Indique une quantité pour voir l\'estimation.</div>' +
          champ("cmdLieu", "Lieu de livraison", "Ex : 12 Vinewood Blvd, Los Santos", "text", 'maxlength="200" required') +
          '<div class="pst-duo">' +
            champ("cmdDate", "Date souhaitée", "", "date", 'min="' + aujourdhui + '" required') +
            champ("cmdHeure", "Heure souhaitée", "", "time", 'step="300" required') +
          '</div>' +
          '<input type="text" id="cmdPiege" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">' +
          '<p class="pst-info">📸 Une photo du lieu de livraison (façade, repère…) te sera demandée <b>directement dans ton ticket</b> sur Discord.</p>' +
          '<div id="cmdErreur" class="pst-erreur" role="alert" hidden></div>' +
          '<button type="submit" class="btn pst-envoyer" id="cmdEnvoyer" style="background:var(--ambre);color:#120C05"><span>Envoyer ma commande</span></button>' +
        '</form>' +
        '<div id="cmdMerci" class="pst-merci" hidden>' +
          '<div class="pst-coche">✓</div><h3>Commande envoyée !</h3>' +
          '<p>Le bot ouvre ton ticket de commande sur Discord — c\'est une question de secondes.<br>' +
          'Tu recevras aussi un message privé. Un commercial prend ta commande en charge et confirme la livraison avec toi.</p>' +
          '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Ouvrir le Discord</span></a>' +
        '</div>' +
        '<div id="cmdIndispo" class="pst-merci" hidden>' +
          '<h3>Commande en ligne bientôt disponible</h3>' +
          '<p>Pour le moment, les commandes se passent directement sur notre Discord : rejoins le serveur et ouvre un ticket commande. Tu peux aussi nous appeler au <b>986</b>.</p>' +
          '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Rejoindre le Discord Oil Roxwood</span></a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fond);

    fond.addEventListener("click", function (e) { if (e.target === fond) fermer(); });
    $(".pst-fermer", fond).addEventListener("click", fermer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !fond.hidden) fermer(); });
    $("#cmdSurDiscord", fond).addEventListener("change", majEtape);
    $("#cmdQte", fond).addEventListener("input", estimer);
    $("#cmdForm", fond).addEventListener("submit", envoyer);
    return fond;
  }

  function estimer() {
    var n = parseInt($("#cmdQte", fond).value, 10), b = $("#cmdEstim", fond);
    if (!(n > 0)) { b.textContent = "Indique une quantité pour voir l'estimation."; return; }
    b.innerHTML = "Estimation : <b>" + fmt(n) + " × " + PRIX_HT + " $ HT = " + fmt(n * PRIX_HT) + " $ HT</b>" +
                  "<small> · TVA de 0 à 5 % selon contrat · tarifs dégressifs sur les gros volumes (le commercial confirme le prix)</small>";
  }

  function majEtape() {
    var ok = $("#cmdSurDiscord", fond).checked;
    $("#cmdRejoindre", fond).hidden = ok;
    $("#cmdForm", fond).hidden = !ok;
    if (ok) setTimeout(function () { var i = $("#cmdDiscord", fond); if (i) i.focus(); }, 50);
  }

  function ouvrir(e) {
    if (e) e.preventDefault();
    construire();
    $("#cmdMerci", fond).hidden = true;
    $("#cmdIndispo", fond).hidden = true;
    var intro = $(".pst-entete p", fond); if (intro) intro.hidden = !HOOK;   // pas de « remplis ce formulaire » s'il n'y en a pas
    if (!HOOK) {
      $("#cmdEtape1", fond).hidden = true; $("#cmdForm", fond).hidden = true; $("#cmdIndispo", fond).hidden = false;
    } else {
      $("#cmdEtape1", fond).hidden = false;
      majEtape();
    }
    fond.hidden = false;
    document.documentElement.classList.add("pst-ouvert");
    var f = $(".pst-fermer", fond); if (f) f.focus();
  }
  function fermer() {
    if (!fond) return;
    fond.hidden = true;
    document.documentElement.classList.remove("pst-ouvert");
  }
  function erreur(msg) { var b = $("#cmdErreur", fond); b.textContent = msg; b.hidden = !msg; }

  function envoyer(e) {
    e.preventDefault();
    erreur("");
    if ($("#cmdPiege", fond).value) return;
    var v = function (id) { return $("#" + id, fond).value.trim(); };
    var d = {
      discord_id: v("cmdDiscord").replace(/\s+/g, ""),
      nom_entreprise: v("cmdNom"), telephone: v("cmdTel"), quantite: v("cmdQte"),
      lieu_livraison: v("cmdLieu"), date: v("cmdDate"), heure: v("cmdHeure")
    };
    if (!/^\d{17,20}$/.test(d.discord_id)) return erreur("Ton ID Discord doit être une suite de 17 à 20 chiffres (pas ton pseudo). Ouvre « Où trouver mon ID Discord ? » pour savoir comment le copier.");
    for (var k in d) if (!d[k]) return erreur("Tous les champs sont obligatoires.");
    var n = parseInt(d.quantite, 10);
    if (!(n >= 1 && n <= 100000)) return erreur("La quantité doit être un nombre de bidons (au moins 1).");
    d.quantite = String(n);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.heure)) return erreur("Date ou heure invalide.");
    var auj = new Date(), jour = auj.getFullYear() + "-" + String(auj.getMonth() + 1).padStart(2, "0") + "-" + String(auj.getDate()).padStart(2, "0");
    var max = new Date(auj.getTime() + 366 * 86400000), jmax = max.getFullYear() + "-" + String(max.getMonth() + 1).padStart(2, "0") + "-" + String(max.getDate()).padStart(2, "0");
    if (d.date < jour) return erreur("La date de livraison souhaitée ne peut pas être dans le passé.");
    if (d.date > jmax) return erreur("La date de livraison souhaitée est trop lointaine (un an maximum).");
    try {
      var dernier = +localStorage.getItem(CLE_LAST) || 0;
      if (Date.now() - dernier < ATTENTE_MIN * 60000)
        return erreur("Tu as déjà envoyé une commande il y a quelques minutes. Regarde ton ticket sur Discord ou réessaie dans " +
          Math.ceil((ATTENTE_MIN * 60000 - (Date.now() - dernier)) / 60000) + " min.");
    } catch (x) {}

    var propre = {}; for (var c in d) propre[c] = String(d[c]).replace(/`{3,}/g, "'''");
    propre.v = 1; propre.src = "site"; propre.t = new Date().toISOString();

    var btn = $("#cmdEnvoyer", fond); btn.disabled = true; btn.firstChild.textContent = "Envoi…";
    fetch(HOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Commandes · site",
        allowed_mentions: { parse: [] },
        content: "ORX-COMMANDE\n```json\n" + JSON.stringify(propre) + "\n```"
      })
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      try { localStorage.setItem(CLE_LAST, String(Date.now())); } catch (x) {}
      $("#cmdEtape1", fond).hidden = true; $("#cmdForm", fond).hidden = true; $("#cmdMerci", fond).hidden = false;
      $("#cmdForm", fond).reset();
    }).catch(function () {
      erreur("L'envoi a échoué. Réessaie dans un instant, ou commande directement sur notre Discord (ou au 986).");
    }).then(function () { btn.disabled = false; btn.firstChild.textContent = "Envoyer ma commande"; });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-commander]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    ouvrir(e);
  });
  window.RoxwoodCommander = { ouvrir: ouvrir };
})();
