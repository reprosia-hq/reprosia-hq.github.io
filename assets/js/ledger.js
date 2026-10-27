/* Home page: the live ledger in the hero. */
(function () {
  "use strict";
  var list = document.getElementById("entries");
  if (!list || !window.RP) return;
  var statusEl = document.getElementById("ledger-status");
  var resetBtn = document.getElementById("ledger-reset");
  var chain = new window.RP.Chain();

  var seed = [
    ["Task scoped: derive change from baseline", "jsmith", "context=supportive analysis"],
    ["AI draft captured: prompt, model, output", "assistant", "model=simulated"],
    ["Review decision: accepted", "jsmith", "reviewer 1 of 1"],
    ["Input data fingerprinted: adlb v3", "system", "sha256 recorded"],
    ["Replay in locked environment: outputs match", "system", "drift=none"]
  ];
  var p = Promise.resolve();
  seed.forEach(function (s, i) {
    p = p.then(function () { return chain.append(s[0], s[1], s[2], "2026-01-15T09:0" + i + ":00.000Z"); });
  });
  p.then(function () { return window.RP.renderChain(chain, list, statusEl, { animate: true }); });

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      chain.restoreAll();
      window.RP.renderChain(chain, list, statusEl, {});
    });
  }
})();
