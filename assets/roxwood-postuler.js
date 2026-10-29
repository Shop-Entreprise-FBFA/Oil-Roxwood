/* OIL ROXWOOD — candidature directe depuis le site.
   Le bouton « Postuler » ouvre un formulaire (mêmes champs que celui du bot Discord + l'ID Discord de la personne).
   À l'envoi, le site dépose la candidature dans un salon privé de Discord (webhook) ; le bot la lit, ouvre un ticket
   de recrutement au nom de la personne (grâce à son ID Discord) et lui en donne l'accès.

   Réglage : window.ROXWOOD_SITE.relais (voir index.html). Tant qu'il est vide, le formulaire n'envoie rien
   et renvoie simplement vers le Discord : on peut donc publier le site avant d'avoir branché le bot. */
(function () {
  var CFG = window.ROXWOOD_SITE || {};
  var INVITE = CFG.discordInvite || "https://discord.com/invite/99AuEX3Kpz";
  // adresse du relais Cloudflare (voir relais-cloudflare/) : jamais un webhook Discord, qui serait supprimé par Discord
  var RELAIS = String(CFG.relais || "").trim().replace(/\/$/, "");
  var HOOK = RELAIS ? RELAIS + "/candidature" : "";
  var ATTENTE_MIN = 30;                       // une candidature par navigateur toutes les 30 minutes
  var CLE_LAST = "orx_candidature_t";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  var fond = null;

  function construire() {
    if (fond) return fond;
    fond = document.createElement("div");
    fond.id = "postuler";
    fond.setAttribute("role", "dialog");
    fond.setAttribute("aria-modal", "true");
    fond.setAttribute("aria-labelledby", "postulerTitre");
    fond.hidden = true;
    fond.innerHTML =
      '<div class="pst-boite">' +
        '<button type="button" class="pst-fermer" aria-label="Fermer">✕</button>' +
        '<div class="pst-entete"><span class="pst-kicker">Recrutement · Oil Roxwood</span>' +
        '<h2 id="postulerTitre">Postuler <span class="creux">directement</span></h2>' +
        '<p>Remplis ce formulaire : un ticket de recrutement s\'ouvre pour toi sur notre Discord, avec toutes tes informations.</p></div>' +
        '<div id="pstEtape1">' +
          '<label class="pst-case"><input type="checkbox" id="pstSurDiscord"> <span>Je suis déjà sur le Discord Oil Roxwood</span></label>' +
          '<div id="pstRejoindre" class="pst-rejoindre">' +
            '<p>Pour que le ticket s\'ouvre à ton nom, tu dois d\'abord être membre de notre serveur Discord.</p>' +
            '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Rejoindre le Discord Oil Roxwood</span></a>' +
            '<p class="pst-note">Une fois dedans, reviens ici et coche la case ci-dessus.</p>' +
          '</div>' +
        '</div>' +
        '<form id="pstForm" novalidate hidden autocomplete="off">' +
          champ("pstDiscord", "ID Discord", "Ex : 123456789012345678", "text", 'inputmode="numeric" maxlength="20" required',
                '<details class="pst-aide"><summary>Où trouver mon ID Discord ?</summary><ol>' +
                '<li>Discord → <b>Paramètres</b> → <b>Avancés</b> → active le <b>Mode développeur</b></li>' +
                '<li>Fais un <b>clic droit sur ton profil</b> (ton nom) → <b>Copier l\'identifiant</b></li>' +
                '<li>Colle-le ici (17 à 20 chiffres)</li></ol></details>') +
          champ("pstPseudo", "Pseudo (prénom + nom RP)", "Ex : Jean Dupont", "text", 'maxlength="100" required') +
          '<div class="pst-duo">' +
            champ("pstNumero", "Numéro de téléphone", "Ex : 555-0123", "text", 'maxlength="50" required') +
            champ("pstIdUnique", "ID unique", "Ton identifiant unique", "text", 'maxlength="50" required') +
          '</div>' +
          champ("pstRib", "RIB", "Ton RIB (RP)", "text", 'maxlength="100" required') +
          champ("pstDispo", "Disponibilités pour l\'entretien", "Ex : soirs en semaine, week-ends", "text", 'maxlength="200" required') +
          '<input type="text" id="pstPiege" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">' +
          '<div class="pst-duo">' +
            fichier("pstCI", "Carte d\'identité (photo)") +
            fichier("pstPermis", "Permis (photo)") +
          '</div>' +
          '<p class="pst-info">📎 Deux images obligatoires (capture ou photo). Elles sont réduites automatiquement et ne sont visibles que du staff, dans ton ticket.</p>' +
          '<div id="pstErreur" class="pst-erreur" role="alert" hidden></div>' +
          '<button type="submit" class="btn pst-envoyer" id="pstEnvoyer" style="background:var(--ambre);color:#120C05"><span>Envoyer ma candidature</span></button>' +
        '</form>' +
        '<div id="pstMerci" class="pst-merci" hidden>' +
          '<div class="pst-coche">✓</div><h3>Candidature envoyée !</h3>' +
          '<p>Le bot ouvre ton ticket de recrutement sur Discord — c\'est une question de secondes.<br>' +
          'Tu recevras aussi un message privé. Ton dossier est déjà complet : ta carte d\'identité et ton permis ont été transmis. Ouvre Discord pour retrouver ton ticket.</p>' +
          '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Ouvrir le Discord</span></a>' +
        '</div>' +
        '<div id="pstIndispo" class="pst-merci" hidden>' +
          '<h3>Candidature en ligne bientôt disponible</h3>' +
          '<p>Pour le moment, la candidature se fait directement sur notre Discord : rejoins le serveur et ouvre un ticket de recrutement.</p>' +
          '<a class="btn" href="' + esc(INVITE) + '" target="_blank" rel="noopener" style="background:var(--ambre);color:#120C05"><span>Rejoindre le Discord Oil Roxwood</span></a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fond);

    fond.addEventListener("click", function (e) { if (e.target === fond) fermer(); });
    $(".pst-fermer", fond).addEventListener("click", fermer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !fond.hidden) fermer(); });
    $("#pstSurDiscord", fond).addEventListener("change", majEtape);
    $("#pstForm", fond).addEventListener("submit", envoyer);
    ["pstCI", "pstPermis"].forEach(function (id) {
      $("#" + id, fond).addEventListener("change", function () {
        var f = this.files && this.files[0];
        $("#" + id + "Nom", fond).textContent = f ? "✓ " + f.name : "Aucun fichier choisi";
      });
    });
    return fond;
  }

  function fichier(id, label) {
    return '<div class="pst-champ pst-fichier"><label for="' + id + '">' + label + '</label>' +
           '<input id="' + id + '" type="file" accept="image/*" required>' +
           '<span class="pst-nom" id="' + id + 'Nom">Aucun fichier choisi</span></div>';
  }

  function champ(id, label, ph, type, attrs, apres) {
    return '<div class="pst-champ"><label for="' + id + '">' + label + '</label>' +
           '<input id="' + id + '" type="' + type + '" placeholder="' + ph + '" ' + attrs + '>' + (apres || "") + '</div>';
  }

  function majEtape() {
    var ok = $("#pstSurDiscord", fond).checked;
    $("#pstRejoindre", fond).hidden = ok;
    $("#pstForm", fond).hidden = !ok;
    if (ok) setTimeout(function () {
      var i = $("#pstDiscord", fond), a = document.activeElement;
      if (i && (!a || a === document.body || a.type === "checkbox")) i.focus();   // ne vole pas le curseur à qui a déjà commencé à écrire
    }, 50);
  }

  function ouvrir(e) {
    if (e) e.preventDefault();
    construire();
    $("#pstMerci", fond).hidden = true;
    $("#pstIndispo", fond).hidden = true;
    var intro = $(".pst-entete p", fond); if (intro) intro.hidden = !HOOK;   // pas de « remplis ce formulaire » s'il n'y en a pas
    if (!HOOK) {                                   // pas encore branché au bot : on renvoie vers le Discord
      $("#pstEtape1", fond).hidden = true; $("#pstForm", fond).hidden = true; $("#pstIndispo", fond).hidden = false;
    } else {
      $("#pstEtape1", fond).hidden = false;
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

  // réduit une image (côté le plus long : 1600 px, JPEG) pour rester bien en dessous des limites de Discord
  function reduire(fichier, nom) {
    return new Promise(function (ok, ko) {
      if (!fichier || !/^image\//.test(fichier.type)) return ko(new Error("pas une image"));
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok({ blob: b, nom: nom + ".jpg" }) : ko(new Error("compression")); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error("image illisible")); };
      img.src = url;
    });
  }

  function erreur(msg) {
    var b = $("#pstErreur", fond);
    b.textContent = msg; b.hidden = !msg;
  }

  function envoyer(e) {
    e.preventDefault();
    erreur("");
    if ($("#pstPiege", fond).value) return;                 // piège à robots rempli : on ignore en silence
    var v = function (id) { return $("#" + id, fond).value.trim(); };
    var d = {
      discord_id: v("pstDiscord").replace(/\s+/g, ""),
      pseudo: v("pstPseudo"), numero: v("pstNumero"), id_unique: v("pstIdUnique"),
      rib: v("pstRib"), disponibilites: v("pstDispo")
    };
    if (!/^\d{17,20}$/.test(d.discord_id)) return erreur("Ton ID Discord doit être une suite de 17 à 20 chiffres (pas ton pseudo). Ouvre « Où trouver mon ID Discord ? » pour savoir comment le copier.");
    for (var k in d) if (!d[k]) return erreur("Tous les champs sont obligatoires.");
    try {
      var dernier = +localStorage.getItem(CLE_LAST) || 0;
      if (Date.now() - dernier < ATTENTE_MIN * 60000)
        return erreur("Tu as déjà envoyé une candidature il y a quelques minutes. Regarde ton ticket sur Discord ou réessaie dans " +
          Math.ceil((ATTENTE_MIN * 60000 - (Date.now() - dernier)) / 60000) + " min.");
    } catch (x) {}

    var fCI = $("#pstCI", fond).files[0], fPermis = $("#pstPermis", fond).files[0];
    if (!fCI || !fPermis) return erreur("La carte d'identité et le permis sont obligatoires : ajoute les deux photos.");
    if (!/^image\//.test(fCI.type) || !/^image\//.test(fPermis.type)) return erreur("Les deux fichiers doivent être des images.");

    // les ``` casseraient le bloc de code lu par le bot
    var propre = {}; for (var c in d) propre[c] = String(d[c]).replace(/`{3,}/g, "'''");
    propre.v = 2; propre.src = "site"; propre.t = new Date().toISOString();

    var btn = $("#pstEnvoyer", fond); btn.disabled = true; btn.firstChild.textContent = "Envoi…";
    Promise.all([reduire(fCI, "carte-identite"), reduire(fPermis, "permis")]).then(function (pieces) {
      var form = new FormData();
      form.append("payload_json", JSON.stringify({
        username: "Candidatures · site",
        allowed_mentions: { parse: [] },
        content: "ORX-CANDIDATURE\n```json\n" + JSON.stringify(propre) + "\n```"
      }));
      form.append("files[0]", pieces[0].blob, pieces[0].nom);
      form.append("files[1]", pieces[1].blob, pieces[1].nom);
      return fetch(HOOK, { method: "POST", body: form });
    }).then(function (r) {
      if (!r.ok) { var er = new Error("http " + r.status); er.statut = r.status; throw er; }
      try { localStorage.setItem(CLE_LAST, String(Date.now())); } catch (x) {}
      $("#pstEtape1", fond).hidden = true; $("#pstForm", fond).hidden = true; $("#pstMerci", fond).hidden = false;
      $("#pstForm", fond).reset();
      ["pstCI", "pstPermis"].forEach(function (id) { $("#" + id + "Nom", fond).textContent = "Aucun fichier choisi"; });
    }).catch(function (e) {
      var st = e && e.statut;
      erreur(e && e.message === "image illisible"
        ? "Une des images n'a pas pu être lue. Essaie avec une capture d'écran au format PNG ou JPEG."
        : st === 404 || st === 401 || st === 403 || st === 503
          ? "La candidature en ligne est momentanément indisponible. Postule directement sur notre Discord, ça marche tout de suite."
        : st === 429
          ? "Trop de demandes en même temps. Réessaie dans une minute."
        : st === 413
          ? "Tes images sont trop lourdes. Essaie avec des captures plus petites."
        : "L'envoi a échoué. Réessaie dans un instant, ou postule directement sur notre Discord.");
    }).then(function () { btn.disabled = false; btn.firstChild.textContent = "Envoyer ma candidature"; });
  }

  // les boutons « Postuler » et « Rejoindre l'équipe » ouvrent le formulaire
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("#navCta,#heroCta,[data-postuler]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    ouvrir(e);
  });
  window.RoxwoodPostuler = { ouvrir: ouvrir };
})();
