/* OIL ROXWOOD — transition « portes blindées » (voir roxwood-portail.css).
   Placé en tout début de <body> sur la vitrine ET sur le dashboard.
   · vitrine   : clic sur un lien vers admin.html → les portes se ferment, puis on ouvre le dashboard
   · dashboard : si l'on arrive de la vitrine, les portes sont déjà fermées et s'ouvrent sur l'écran de connexion
   · dashboard : clic sur « Se connecter avec Discord » → les portes se ferment le temps de partir chez Discord
   · dashboard : au retour de Discord, les portes restent fermées (« vérification de l'identité »),
                 puis s'ouvrent dès que le dashboard (ou le message de refus) est prêt.
   Aucune ligne du code de connexion n'est touchée : on observe seulement ce qui s'affiche. */
(function () {
  var racine = document.documentElement;
  var CLE = "orx_portail";
  var reduit = false;
  try { reduit = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function construire() {
    var p = document.getElementById("portail");
    if (p) return p;
    p = document.createElement("div");
    p.id = "portail";
    p.setAttribute("aria-hidden", "true");
    p.innerHTML =
      '<div class="portail-porte portail-g"></div><div class="portail-porte portail-d"></div>' +
      '<div class="portail-scan"></div>' +
      '<div class="portail-centre">' +
        '<div class="portail-embleme"><img src="assets/logo.png?v=2" alt=""></div>' +
        '<div class="portail-titre">Espace <b>membre</b></div>' +
        '<div class="portail-sous">Accès sécurisé · vérification</div>' +
      '</div>';
    document.body.insertBefore(p, document.body.firstChild);
    return p;
  }
  function texte(p, titre, sous) {
    var t = p.querySelector(".portail-titre"), s = p.querySelector(".portail-sous");
    if (t) t.innerHTML = titre;
    if (s) s.textContent = sous;
  }
  function ouvrir(p) {
    p.classList.add("ouvre");
    setTimeout(function () { racine.classList.remove("portail-on"); p.style.display = "none"; }, 1000);
  }
  function visible(el) { return !!el && getComputedStyle(el).display !== "none"; }

  // ---------- côté dashboard : arrivée depuis la vitrine OU retour de Discord ----------
  var retourDiscord = false, depuisVitrine = false;
  try { retourDiscord = /access_token=/.test(location.hash || ""); } catch (e) {}
  try { depuisVitrine = sessionStorage.getItem(CLE) === "1"; } catch (e) {}
  if ((retourDiscord || depuisVitrine) && !reduit && document.body) {
    try { sessionStorage.removeItem(CLE); } catch (e) {}      // ne rejoue pas au rechargement
    racine.classList.add("portail-on");
    var p = construire();

    if (retourDiscord) {
      // on attend que le dashboard soit réellement affiché (ou qu'un refus soit écrit), sans toucher à la connexion
      texte(p, "Identité <b>Discord</b>", "Vérification de ton compte");
      var debut = Date.now(), fait = false;
      var finir = function () {
        if (fait) return; fait = true;
        texte(p, "Identité <b>vérifiée</b>", "Bienvenue chez Oil Roxwood");
        setTimeout(function () { ouvrir(p); }, 650);
      };
      var guet = setInterval(function () {
        var pret = visible(document.getElementById("app")) || visible(document.getElementById("lg_denied"));
        if ((pret && Date.now() - debut > 900) || Date.now() - debut > 12000) { clearInterval(guet); finir(); }
      }, 150);
    } else {
      var pret = function () { setTimeout(function () { ouvrir(p); }, 500); };
      if (document.readyState === "complete") pret(); else window.addEventListener("load", pret);
      setTimeout(function () { if (racine.classList.contains("portail-on")) ouvrir(p); }, 4000);   // filet de sécurité
    }

    // départ chez Discord depuis ce dashboard (l'utilisateur peut retenter après un refus)
    brancherConnexion();
    return;
  }

  brancherConnexion();

  // ---------- côté dashboard : clic sur « Se connecter avec Discord » ----------
  function brancherConnexion() {
    document.addEventListener("click", function (e) {
      if (reduit || e.defaultPrevented) return;
      var b = e.target.closest && e.target.closest(".btn-discord");
      if (!b || typeof window.loginDiscord !== "function") return;
      e.preventDefault(); e.stopImmediatePropagation();
      var p = construire();
      racine.classList.remove("portail-on");
      p.classList.remove("ouvre"); p.style.display = "";
      texte(p, "Connexion <b>Discord</b>", "Redirection sécurisée");
      p.classList.add("actif");
      requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add("ferme"); }); });
      setTimeout(function () { window.loginDiscord(); }, 1300);
    }, true);
  }

  // ---------- côté vitrine : départ vers le dashboard ----------
  document.addEventListener("click", function (e) {
    if (reduit || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="admin.html"]');
    if (!a || a.target === "_blank") return;
    e.preventDefault();
    var cible = a.href;
    try { sessionStorage.setItem(CLE, "1"); } catch (x) {}
    var p = construire();
    p.classList.add("actif");
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add("ferme"); }); });
    setTimeout(function () { location.href = cible; }, 1900);
  });

  // retour arrière : la page revient figée avec les portes fermées → on les rouvre
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    var p = document.getElementById("portail");
    if (p) { p.classList.remove("ferme", "actif"); }
    try { sessionStorage.removeItem(CLE); } catch (x) {}
  });
})();
