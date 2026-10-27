/* ReproNet: a live network of linked nodes with blocks travelling along the links,
   like hashes passed down a chain. Themeable, pauses off-screen, respects reduced motion. */
(function () {
  "use strict";
  window.ReproNet = function (cv, opt) {
    var o = Object.assign({
      link: "#fff", node: "#fff", pulse: "#fff", glow: null, label: "#fff",
      shape: "dot", dash: false, dist: 150, density: 15000, max: 72, alpha: 0.35,
      twinkle: false, interact: true, speed: 0.28, anchors: null, size: 1.7
    }, opt || {});
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, nodes = [], pulses = [], anchors = [], chain = { i: 0, t: 0 }, mouse = null;
    var visible = true, running = false, tick = 0;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var parent = cv.parentElement;

    function size() {
      var r = parent.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(o.max, (W * H) / o.density));
      nodes = [];
      for (var i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * o.speed, vy: (Math.random() - 0.5) * o.speed, p: Math.random() * 6.28 });
      anchors = (W < 700 ? [] : (o.anchors || [])).map(function (a) { return { rx: a[0], ry: a[1], name: a[2], x: a[0] * W, y: a[1] * H, p: Math.random() * 6.28 }; });
    }
    function shape(x, y, r, fill) {
      ctx.beginPath();
      if (o.shape === "square") { fill ? ctx.fillRect(x - r, y - r, r * 2, r * 2) : ctx.strokeRect(x - r, y - r, r * 2, r * 2); return; }
      if (o.shape === "cross") { ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x + r * 1.6, y); ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y + r * 1.6); ctx.stroke(); return; }
      if (o.shape === "diamond") { ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x + r * 1.5, y); ctx.lineTo(x, y + r * 1.5); ctx.lineTo(x - r * 1.5, y); ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); return; }
      ctx.arc(x, y, r, 0, 6.283); fill ? ctx.fill() : ctx.stroke();
    }
    function line(ax, ay, bx, by, a, col, w) {
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w || 1;
      if (o.dash) ctx.setLineDash([4, 6]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    }
    function block(x, y, s, col) {
      ctx.globalAlpha = 0.95; ctx.fillStyle = col; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 0.22; ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }
    function draw(still) {
      tick += 1;
      ctx.clearRect(0, 0, W, H);
      var i, j, a, b, dx, dy, d, D = o.dist;
      if (!still) {
        for (i = 0; i < nodes.length; i++) {
          a = nodes[i]; a.x += a.vx; a.y += a.vy;
          if (a.x < 0 || a.x > W) a.vx *= -1;
          if (a.y < 0 || a.y > H) a.vy *= -1;
        }
      }
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          a = nodes[i]; b = nodes[j]; dx = a.x - b.x; dy = a.y - b.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d < D) line(a.x, a.y, b.x, b.y, (1 - d / D) * o.alpha, o.link, 1);
        }
      }
      if (o.interact && mouse) {
        for (i = 0; i < nodes.length; i++) {
          a = nodes[i]; dx = a.x - mouse.x; dy = a.y - mouse.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d < D * 1.25) line(a.x, a.y, mouse.x, mouse.y, (1 - d / (D * 1.25)) * Math.min(1, o.alpha * 2.2), o.pulse, 1.2);
        }
      }
      ctx.fillStyle = o.node; ctx.strokeStyle = o.node; ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        ctx.globalAlpha = o.twinkle ? 0.35 + 0.65 * Math.abs(Math.sin(tick * 0.02 + a.p)) : 0.85;
        shape(a.x, a.y, o.size, o.shape !== "cross");
      }
      /* Labelled anchors form the main chain; a block travels link to link. */
      if (anchors.length) {
        for (i = 0; i < anchors.length; i++) {
          a = anchors[i];
          if (!still) { a.x = a.rx * W + Math.sin(tick * 0.012 + a.p) * 7; a.y = a.ry * H + Math.cos(tick * 0.01 + a.p) * 7; }
          if (i > 0) line(anchors[i - 1].x, anchors[i - 1].y, a.x, a.y, 0.7, o.pulse, 1.4);
        }
        for (i = 0; i < anchors.length; i++) {
          a = anchors[i];
          if (o.glow) { ctx.globalAlpha = 0.18; ctx.fillStyle = o.glow; ctx.beginPath(); ctx.arc(a.x, a.y, 16, 0, 6.283); ctx.fill(); }
          ctx.globalAlpha = 1; ctx.fillStyle = o.pulse; ctx.strokeStyle = o.pulse;
          var keep = o.shape; o.shape = "dot"; shape(a.x, a.y, 4.2, true); o.shape = keep;
          ctx.fillStyle = o.label; ctx.font = "500 12px ui-monospace, Menlo, monospace"; ctx.globalAlpha = 0.95;
          ctx.fillText(a.name, a.x + 12, a.y + 4);
        }
        if (!still && anchors.length > 1) {
          chain.t += 0.012;
          if (chain.t >= 1) { chain.t = 0; chain.i = (chain.i + 1) % (anchors.length - 1 + 3); }
          if (chain.i < anchors.length - 1) {
            var p0 = anchors[chain.i], p1 = anchors[chain.i + 1];
            block(p0.x + (p1.x - p0.x) * chain.t, p0.y + (p1.y - p0.y) * chain.t, 8, o.pulse);
          }
        }
      }
      if (!still) {
        if (pulses.length < 3 && nodes.length && Math.random() < 0.03) {
          var s = nodes[Math.floor(Math.random() * nodes.length)], best = null, bd = D;
          for (i = 0; i < nodes.length; i++) {
            dx = s.x - nodes[i].x; dy = s.y - nodes[i].y; d = Math.sqrt(dx * dx + dy * dy);
            if (nodes[i] !== s && d < bd && Math.random() < 0.5) { bd = d; best = nodes[i]; }
          }
          if (best) pulses.push({ a: s, b: best, t: 0 });
        }
        for (i = pulses.length - 1; i >= 0; i--) {
          var q = pulses[i]; q.t += 0.03;
          block(q.a.x + (q.b.x - q.a.x) * q.t, q.a.y + (q.b.y - q.a.y) * q.t, 6, o.pulse);
          if (q.t >= 1) pulses.splice(i, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
    function loop() { if (!running) return; if (visible && !document.hidden) draw(false); requestAnimationFrame(loop); }
    size();
    window.addEventListener("resize", function () { size(); if (reduce) draw(true); });
    if (o.interact) {
      parent.addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
      parent.addEventListener("pointerleave", function () { mouse = null; });
    }
    if (reduce) draw(true);
    else {
      running = true; loop();
      if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
    }
    return { set: function (p) { Object.assign(o, p); if (reduce) draw(true); } };
  };
})();
