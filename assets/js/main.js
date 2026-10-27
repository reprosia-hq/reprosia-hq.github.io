/* Reprosia — core behaviour and the hash-chain engine shared by the demos. No dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  var RP = (window.RP = {});
  RP.reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* Theme: dark by default; the visitor can switch to light and the choice is remembered. */
  try {
    var saved = localStorage.getItem("reprosia-theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked */ }
  var themeBtn = document.getElementById("theme-toggle");
  function isDark() {
    var t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return true; /* dark unless the visitor chose light */
  }
  function syncThemeBtn() { if (themeBtn) themeBtn.textContent = isDark() ? "Light theme" : "Dark theme"; }
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("reprosia-theme", next); } catch (e) { /* ignore */ }
      syncThemeBtn();
      if (RP.recolor) RP.recolor();
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

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* Contact form: builds a mailto link; nothing is sent from the page. */
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

  /* Pointer glow on glass surfaces */
  document.addEventListener("pointermove", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(".glass,.tile,.ledger,.panel") : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px");
    el.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  /* Hero network: nodes drift, links fade with distance, and "blocks" travel along links. */
  var cv = document.getElementById("hero-canvas");
  if (cv && cv.getContext) {
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, nodes = [], pulses = [], running = false, visible = true;
    var c1 = "#6EE7F9", c2 = "#A78BFA";
    RP.recolor = function () {
      var cs = getComputedStyle(root);
      c1 = cs.getPropertyValue("--accent").trim() || c1;
      c2 = cs.getPropertyValue("--accent-2").trim() || c2;
      if (RP.reduce) draw(true);
    };
    function size() {
      var r = cv.parentElement.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(72, (W * H) / 15000));
      nodes = [];
      for (var i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28 });
      RP.recolor();
    }
    function draw(still) {
      ctx.clearRect(0, 0, W, H);
      var D = 150, i, j, a, b, dx, dy, d;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        if (!still) {
          a.x += a.vx; a.y += a.vy;
          if (a.x < 0 || a.x > W) a.vx *= -1;
          if (a.y < 0 || a.y > H) a.vy *= -1;
        }
      }
      ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          a = nodes[i]; b = nodes[j]; dx = a.x - b.x; dy = a.y - b.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d < D) {
            ctx.globalAlpha = (1 - d / D) * 0.38; ctx.strokeStyle = c1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.85; ctx.fillStyle = c1;
      for (i = 0; i < nodes.length; i++) { ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, 1.7, 0, 6.283); ctx.fill(); }
      if (!still) {
        if (pulses.length < 3 && Math.random() < 0.03) {
          var s = nodes[Math.floor(Math.random() * nodes.length)], best = null, bd = D;
          for (i = 0; i < nodes.length; i++) {
            dx = s.x - nodes[i].x; dy = s.y - nodes[i].y; d = Math.sqrt(dx * dx + dy * dy);
            if (nodes[i] !== s && d < bd && Math.random() < 0.5) { bd = d; best = nodes[i]; }
          }
          if (best) pulses.push({ a: s, b: best, t: 0, hops: 0 });
        }
        for (i = pulses.length - 1; i >= 0; i--) {
          var p = pulses[i]; p.t += 0.03;
          var px = p.a.x + (p.b.x - p.a.x) * p.t, py = p.a.y + (p.b.y - p.a.y) * p.t;
          ctx.globalAlpha = 0.95; ctx.fillStyle = c2; ctx.fillRect(px - 4, py - 4, 8, 8);
          ctx.globalAlpha = 0.25; ctx.fillRect(px - 8, py - 8, 16, 16);
          if (p.t >= 1) pulses.splice(i, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
    function loop() {
      if (!running) return;
      if (visible && !document.hidden) draw(false);
      window.requestAnimationFrame(loop);
    }
    size();
    window.addEventListener("resize", function () { size(); if (RP.reduce) draw(true); });
    if (RP.reduce) { draw(true); }
    else {
      running = true; loop();
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
      }
    }
  }

  /* ---------- Hash-chain engine (SHA-256 via Web Crypto, small fallback if unavailable) ---------- */
  RP.sha = function (text) {
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
  };
  RP.short = function (h) { return h.slice(0, 8) + "…" + h.slice(-4); };

  var GENESIS = new Array(65).join("0");

  function Chain() { this.entries = []; }
  Chain.prototype.payload = function (e) { return [e.seq, e.ts, e.actor, e.what, e.detail || ""].join("|"); };
  Chain.prototype.append = function (what, actor, detail, ts) {
    var self = this;
    var prev = this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS;
    var e = { seq: this.entries.length + 1, ts: ts || new Date().toISOString(), actor: actor, what: what, detail: detail || "", orig: what, prev: prev, hash: "", altered: false };
    return RP.sha(prev + this.payload(e)).then(function (h) { e.hash = h; self.entries.push(e); return e; });
  };
  Chain.prototype.toggle = function (i) {
    var e = this.entries[i];
    e.altered = !e.altered;
    e.what = e.altered ? e.orig + " (changed after the fact)" : e.orig;
  };
  Chain.prototype.restoreAll = function () {
    this.entries.forEach(function (e) { e.altered = false; e.what = e.orig; });
  };
  Chain.prototype.verify = function () {
    var self = this;
    return Promise.all(this.entries.map(function (e, i) {
      return RP.sha(e.prev + self.payload(e)).then(function (h) {
        var okLink = i === 0 ? e.prev === GENESIS : e.prev === self.entries[i - 1].hash;
        return { okSelf: h === e.hash, okLink: okLink };
      });
    })).then(function (res) {
      var bad = -1;
      for (var i = 0; i < res.length; i++) { if (!res[i].okSelf || !res[i].okLink) { bad = i; break; } }
      return { res: res, bad: bad };
    });
  };
  Chain.prototype.export = function (verified) {
    return {
      generated: new Date().toISOString(),
      note: "Illustrative export from the Reprosia browser demo. Not output from regulog.",
      chain_verified: verified,
      entries: this.entries.map(function (e) {
        return { seq: e.seq, timestamp: e.ts, actor: e.actor, event: e.what, detail: e.detail, previous_hash: e.prev, hash: e.hash };
      })
    };
  };
  RP.Chain = Chain;

  /* Render a chain into a list. Each entry gets an Alter/Undo button so tamper-evidence can be seen. */
  RP.renderChain = function (chain, listEl, statusEl, opts) {
    opts = opts || {};
    return chain.verify().then(function (v) {
      listEl.innerHTML = "";
      if (!chain.entries.length) {
        var li0 = document.createElement("li");
        li0.className = "entry";
        var sp = document.createElement("span"); sp.className = "entry-seq"; sp.textContent = "-";
        var mn = document.createElement("div"); mn.className = "entry-main";
        var wt = document.createElement("div"); wt.className = "entry-what muted"; wt.textContent = opts.empty || "No entries yet.";
        mn.appendChild(wt); li0.appendChild(sp); li0.appendChild(mn); listEl.appendChild(li0);
      }
      chain.entries.forEach(function (r, i) {
        var li = document.createElement("li");
        var bad = !v.res[i].okLink || !v.res[i].okSelf;
        li.className = "entry" + (r.altered ? " is-altered" : "") + (bad ? " is-bad" : "");
        if (opts.animate && !RP.reduce) { li.className += " appear"; li.style.animationDelay = (i * 0.28) + "s"; }

        var seq = document.createElement("span"); seq.className = "entry-seq"; seq.textContent = String(i + 1);
        var main = document.createElement("div"); main.className = "entry-main";
        var what = document.createElement("div"); what.className = "entry-what"; what.textContent = r.what;
        var actor = document.createElement("div"); actor.className = "entry-actor";
        actor.textContent = r.actor + (r.detail ? "  ·  " + r.detail : "");
        main.appendChild(what); main.appendChild(actor);

        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "alter-btn"; btn.textContent = r.altered ? "Undo" : "Alter";
        btn.setAttribute("aria-label", (r.altered ? "Undo change to entry " : "Alter entry ") + (i + 1));
        btn.addEventListener("click", function () {
          chain.toggle(i);
          RP.renderChain(chain, listEl, statusEl, { empty: opts.empty, after: opts.after });
        });

        var hash = document.createElement("div"); hash.className = "entry-hash";
        var a = document.createElement("span"); a.textContent = "previous ";
        var ab = document.createElement("b"); ab.textContent = i === 0 ? "start" : RP.short(r.prev);
        if (!v.res[i].okLink) ab.className = "link-bad";
        var hb = document.createElement("b"); hb.textContent = RP.short(r.hash);
        hash.appendChild(a); hash.appendChild(ab); hash.appendChild(document.createTextNode("   this ")); hash.appendChild(hb);
        if (!v.res[i].okSelf) {
          var n1 = document.createElement("span"); n1.className = "link-bad"; n1.textContent = "   content no longer matches this hash"; hash.appendChild(n1);
        } else if (!v.res[i].okLink) {
          var n2 = document.createElement("span"); n2.className = "link-bad"; n2.textContent = "   does not match entry " + i; hash.appendChild(n2);
        }
        li.appendChild(seq); li.appendChild(main); li.appendChild(btn); li.appendChild(hash);
        listEl.appendChild(li);
      });

      if (statusEl) {
        if (!chain.entries.length) {
          statusEl.className = "ledger-status"; statusEl.textContent = "Chain empty";
        } else if (v.bad === -1) {
          statusEl.className = "ledger-status";
          statusEl.textContent = "Chain intact: " + chain.entries.length + " of " + chain.entries.length + " entries verify";
        } else {
          statusEl.className = "ledger-status is-broken";
          statusEl.textContent = "Chain broken at entry " + (v.bad + 1) + ": record no longer matches";
        }
      }
      if (opts.after) opts.after(v);
      return v;
    });
  };

  /* Download helper */
  RP.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  };
})();
