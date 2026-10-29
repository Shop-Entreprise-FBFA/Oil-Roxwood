/* OIL ROXWOOD — animation d'entrée de la vitrine (voir roxwood-intro.css).
   Ne s'affiche qu'à la première page d'une visite, et seulement si le visiteur n'a pas demandé « moins d'animations ». */
(function () {
  var racine = document.documentElement;
  var intro = document.getElementById("intro");
  if (!racine.classList.contains("intro-on") || !intro) return;

  var DUREE_MINI = 3000;                    // le temps de voir l'animation en entier
  var DUREE_MAXI = 5500;                    // filet de sécurité si la page tarde à charger
  var debut = Date.now(), fini = false;

  function terminer() {
    if (fini) return;
    fini = true;
    try { sessionStorage.setItem("orx_intro", "1"); } catch (e) {}
    intro.classList.add("sortie");
    setTimeout(function () {
      racine.classList.remove("intro-on");
      racine.classList.add("intro-fini");
    }, 950);
  }

  function pret() {
    var reste = Math.max(0, DUREE_MINI - (Date.now() - debut));
    setTimeout(terminer, reste);
  }

  if (document.readyState === "complete") pret();
  else window.addEventListener("load", pret);
  setTimeout(terminer, DUREE_MAXI);

  intro.addEventListener("click", terminer);                       // un clic suffit pour passer
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") terminer();
  });
})();
