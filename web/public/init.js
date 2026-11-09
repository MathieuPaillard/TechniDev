// Chargé avant le premier affichage : applique le gaz et l'état des tubes retenus dans ce navigateur,
// pour que la page ne change pas de couleur sous les yeux, et décide si l'enseigne joue son amorçage
// (une fois par visite, jamais si le système demande de réduire les animations).
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var gas = localStorage.getItem('technidev.gas');
    if (gas === 'he' || gas === 'ne' || gas === 'ar' || gas === 'kr' || gas === 'xe') root.dataset.gas = gas;
    if (localStorage.getItem('technidev.tubes') === 'off') root.dataset.tubes = 'off';
  } catch (error) {
    // Stockage indisponible (navigation privée stricte) : le site garde l'argon.
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ignited = false;
  try {
    ignited = sessionStorage.getItem('technidev.ignited') === '1';
  } catch (error) {
    ignited = false;
  }
  if (!reduce && !ignited && root.dataset.tubes !== 'off') root.classList.add('ignite');
})();
