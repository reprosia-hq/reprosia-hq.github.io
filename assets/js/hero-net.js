/* Home hero: the live chain network. Colours come from the theme tokens. */
(function () {
  "use strict";
  var cv = document.getElementById("net");
  if (!cv || !window.ReproNet) return;
  function cols() {
    var cs = getComputedStyle(document.documentElement);
    function g(n) { return cs.getPropertyValue(n).trim(); }
    return { link: g("--net-link"), node: g("--net-node"), pulse: g("--net-pulse"), glow: g("--net-glow"), label: g("--net-label") };
  }
  var net = window.ReproNet(cv, Object.assign({
    shape: "diamond", dash: true, twinkle: false, alpha: 0.45, size: 1.6, dist: 160,
    anchors: [[0.55, 0.14, "regulog"], [0.88, 0.10, "lineager"], [0.88, 0.88, "reproducr"], [0.56, 0.92, "bayprior"]]
  }, cols()));
  window.RP = window.RP || {};
  window.RP.recolor = function () { net.set(cols()); };
})();
