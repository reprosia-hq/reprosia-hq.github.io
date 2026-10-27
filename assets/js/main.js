/* Reprosia — site behaviour. No dependencies. */
(function () {
  "use strict";

  /* Theme: follows the system unless the visitor picks one. Storage may be unavailable. */
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("reprosia-theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked: stay on system theme */ }

  var themeBtn = document.getElementById("theme-toggle");
  function isDark() {
    var t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function syncThemeBtn() {
    if (!themeBtn) return;
    themeBtn.textContent = isDark() ? "Light theme" : "Dark theme";
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("reprosia-theme", next); } catch (e) { /* ignore */ }
      syncThemeBtn();
    });
    syncThemeBtn();
  }

  /* Mobile menu */
  var menuBtn = document.getElementById("menu-toggle");
  var nav = document.getElementById("site-nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.textContent = open ? "Close" : "Menu";
    });
  }

  /* Year */
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* Contact form: builds a mailto link, nothing is sent from the page. */
  var form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = form.elements.name.value.trim();
      var org = form.elements.org.value.trim();
      var msg = form.elements.message.value.trim();
      var body = msg + "\n\n" + name + (org ? "\n" + org : "");
      window.location.href = "mailto:team@reprosia.com?subject=" +
        encodeURIComponent("Early access enquiry") + "&body=" + encodeURIComponent(body);
    });
  }

  /* Hash-chain demo -------------------------------------------------------- */
  var list = document.getElementById("entries");
  if (!list) return;

  var statusEl = document.getElementById("ledger-status");
  var resetBtn = document.getElementById("ledger-reset");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SEED = [
    { what: "Task scoped: derive change from baseline", actor: "jsmith", alt: "Task scoped: derive percent change" },
    { what: "AI draft captured: prompt, model, output", actor: "assistant", alt: "AI draft captured: output only" },
    { what: "Review decision: accepted", actor: "jsmith", alt: "Review decision: rejected" },
    { what: "Input data hashed: adlb v3", actor: "system", alt: "Input data hashed: adlb v2" },
    { what: "Replay in locked environment: outputs match", actor: "system", alt: "Replay in locked environment: not run" }
  ];

  /* SHA-256 via Web Crypto; small fallback hash if unavailable (e.g. insecure context). */
  function sha(text) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        var out = "", v = new Uint8Array(buf);
        for (var i = 0; i < v.length; i++) out += ("0" + v[i].toString(16)).slice(-2);
        return out;
      });
    }
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var s = ("00000000" + h.toString(16)).slice(-8);
    return Promise.resolve(s + s + s + s + s + s + s + s);
  }

  var GENESIS = new Array(65).join("0");
  var chain = [];     /* stored records: { what, actor, prev, hash, altered } */

  function payload(r) { return r.actor + "|" + r.what; }

  function build() {
    chain = [];
    var p = Promise.resolve(GENESIS);
    SEED.forEach(function (s, i) {
      p = p.then(function (prev) {
        return sha(prev + payload(s)).then(function (h) {
          chain.push({ what: s.what, actor: s.actor, prev: prev, hash: h, altered: false });
          return h;
        });
      });
    });
    return p;
  }

  function short(h) { return h.slice(0, 8) + "…" + h.slice(-4); }

  /* Verify: every record must hash correctly and point at the previous record's hash. */
  function verify() {
    var bad = -1, jobs = chain.map(function (r, i) {
      return sha(r.prev + payload(r)).then(function (h) {
        var okSelf = h === r.hash;
        var okLink = i === 0 ? r.prev === GENESIS : r.prev === chain[i - 1].hash;
        return { okSelf: okSelf, okLink: okLink };
      });
    });
    return Promise.all(jobs).then(function (res) {
      for (var i = 0; i < res.length; i++) { if (!res[i].okSelf || !res[i].okLink) { bad = i; break; } }
      return { res: res, bad: bad };
    });
  }

  function render(animate) {
    return verify().then(function (v) {
      list.innerHTML = "";
      chain.forEach(function (r, i) {
        var li = document.createElement("li");
        li.className = "entry" + (r.altered ? " is-altered" : "") + ((!v.res[i].okLink || !v.res[i].okSelf) ? " is-bad" : "");
        if (animate && !reduce) { li.className += " appear"; li.style.animationDelay = (i * 0.28) + "s"; }

        var seq = document.createElement("span");
        seq.className = "entry-seq"; seq.textContent = String(i + 1);

        var main = document.createElement("div");
        main.className = "entry-main";
        var what = document.createElement("div");
        what.className = "entry-what"; what.textContent = r.what;
        var actor = document.createElement("div");
        actor.className = "entry-actor"; actor.textContent = r.actor;
        main.appendChild(what); main.appendChild(actor);

        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "alter-btn";
        btn.textContent = r.altered ? "Undo" : "Alter";
        btn.setAttribute("aria-label", (r.altered ? "Undo change to entry " : "Alter entry ") + (i + 1));
        btn.addEventListener("click", function () { toggle(i); });

        var hash = document.createElement("div");
        hash.className = "entry-hash";
        var link = i === 0 ? "start" : short(r.prev);
        hash.innerHTML = "";
        var a = document.createElement("span");
        a.textContent = "previous ";
        var ab = document.createElement("b");
        ab.textContent = link;
        if (!v.res[i].okLink) { ab.className = "link-bad"; }
        var sep = document.createTextNode("   this ");
        var hb = document.createElement("b");
        hb.textContent = short(r.hash);
        hash.appendChild(a); hash.appendChild(ab); hash.appendChild(sep); hash.appendChild(hb);
        if (!v.res[i].okSelf) {
          var note = document.createElement("span");
          note.className = "link-bad";
          note.textContent = "   content no longer matches this hash";
          hash.appendChild(note);
        } else if (!v.res[i].okLink) {
          var note2 = document.createElement("span");
          note2.className = "link-bad";
          note2.textContent = "   does not match entry " + i;
          hash.appendChild(note2);
        }

        li.appendChild(seq); li.appendChild(main); li.appendChild(btn); li.appendChild(hash);
        list.appendChild(li);
      });

      if (v.bad === -1) {
        statusEl.className = "ledger-status";
        statusEl.textContent = "Chain intact: " + chain.length + " of " + chain.length + " entries verify";
      } else {
        statusEl.className = "ledger-status is-broken";
        statusEl.textContent = "Chain broken at entry " + (v.bad + 1) + ": record no longer matches";
      }
    });
  }

  /* Altering an entry changes its content but not its stored hash, so verification fails
     at that entry. */
  function toggle(i) {
    var r = chain[i];
    r.altered = !r.altered;
    r.what = r.altered ? SEED[i].alt : SEED[i].what;
    render(false);
  }

  build().then(function () { return render(true); });

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      chain.forEach(function (r, i) {
        r.altered = false; r.what = SEED[i].what;
      });
      render(false);
    });
  }
})();
