/* OIL ROXWOOD — transition « portes blindées » (voir roxwood-portail.css).
   Placé en tout début de <body> sur la vitrine ET sur le dashboard.
   · vitrine  : clic sur un lien vers admin.html → les portes se ferment, puis on ouvre le dashboard
   · dashboard: si l'on arrive de la vitrine, les portes sont déjà fermées et s'ouvrent sur l'écran de connexion */
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

  // ---------- côté dashboard : arrivée depuis la vitrine ----------
  var arrivee = false;
  try { arrivee = sessionStorage.getItem(CLE) === "1" && !reduit; } catch (e) {}
  if (arrivee && document.body) {
    try { sessionStorage.removeItem(CLE); } catch (e) {}      // ne rejoue pas au rechargement
    racine.classList.add("portail-on");
    var p = construire();
    var ouvrir = function () {
      p.classList.add("ouvre");
      setTimeout(function () { racine.classList.remove("portail-on"); p.style.display = "none"; }, 1000);
    };
    // on laisse voir l'écran « accès sécurisé » un instant, puis les portes s'ouvrent
    var pret = function () { setTimeout(ouvrir, 500); };
    if (document.readyState === "complete") pret(); else window.addEventListener("load", pret);
    setTimeout(function () { if (racine.classList.contains("portail-on")) ouvrir(); }, 4000);   // filet de sécurité
    return;
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
