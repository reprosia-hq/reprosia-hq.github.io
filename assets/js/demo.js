/* Live demo page: audited AI assist simulator, readiness check, evidence search.
   Everything runs in the browser. No model is called and no data leaves the page. */
(function () {
  "use strict";
  var RP = window.RP;
  if (!RP || !document.getElementById("panel-wb")) return;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /* ---------------- Tabs ---------------- */
  var tabs = [].slice.call(document.querySelectorAll(".tab"));
  function showTab(panelId) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-panel") === panelId;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("data-panel")).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () {
      var id = t.getAttribute("data-panel");
      showTab(id);
      try { history.replaceState(null, "", "#" + id.replace("panel-", "")); } catch (e) { /* ignore */ }
    });
    t.addEventListener("keydown", function (ev) {
      var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); n.click();
    });
  });
  var hash = location.hash.replace("#", "");
  showTab(["wb", "ready", "search"].indexOf(hash) >= 0 ? "panel-" + hash : "panel-wb");

  /* ---------------- Workbench ---------------- */
  var TASKS = {
    cfb: { title: "Derive change from baseline (ADLB)", ds: "ADLB", pkg: "dplyr 1.1.4", code: [
      "adlb <- adlb |>",
      "  dplyr::group_by(USUBJID, PARAMCD) |>",
      "  dplyr::mutate(",
      "    BASE = AVAL[ABLFL == \"Y\"][1],",
      "    CHG  = AVAL - BASE",
      "  ) |>",
      "  dplyr::ungroup()"].join("\n") },
    km: { title: "Median survival by arm (ADTTE)", ds: "ADTTE", pkg: "survival 3.8-3", code: [
      "fit <- survival::survfit(",
      "  survival::Surv(AVAL, CNSR) ~ TRT01P,",
      "  data = adtte",
      ")",
      "summary(fit)$table[, \"median\"]"].join("\n"),
      fix: /Surv\(\s*AVAL\s*,\s*1\s*-\s*CNSR\s*\)/,
      bug: "The draft passes CNSR (1 = censored) as the event indicator, so censored subjects count as events and the medians are wrong. The fix is Surv(AVAL, 1 - CNSR)." },
    ae: { title: "Flag treatment-emergent adverse events (ADAE)", ds: "ADAE", pkg: "dplyr 1.1.4", code: [
      "adae <- adae |>",
      "  dplyr::mutate(",
      "    TRTEMFL = dplyr::if_else(",
      "      ASTDT >= TRTSDT & ASTDT <= TRTEDT + 30, \"Y\", \"\"",
      "    )",
      "  )"].join("\n") }
  };
  var TIERS = { explore: ["Exploratory", 1], support: ["Supportive analysis", 1], primary: ["Primary analysis", 2] };
  var SCOPER = "jsmith";
  var chain, S, verified = true, shown = 0;

  /* Small synthetic datasets, built the same way every time, so the fingerprints are of real bytes.
     v3 differs from v2 by one corrected value and one added row. */
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function dataRows(task) {
    var r = rng({ cfb: 11, km: 23, ae: 37 }[task]), rows = [], i, id;
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    if (task === "km") {
      rows.push(["USUBJID", "TRT01P", "AVAL", "CNSR"]);
      for (i = 1; i <= 24; i++) rows.push(["S" + pad(i), i % 2 ? "Placebo" : "Active", String(20 + Math.floor(r() * 180)), r() < 0.35 ? "1" : "0"]);
    } else if (task === "cfb") {
      rows.push(["USUBJID", "PARAMCD", "AVISIT", "ABLFL", "AVAL"]);
      for (i = 1; i <= 12; i++) { id = "S" + pad(i); var base = 20 + Math.floor(r() * 30); rows.push([id, "ALT", "Baseline", "Y", String(base)]); rows.push([id, "ALT", "Week 12", "", String(base + Math.floor(r() * 12) - 4)]); }
    } else {
      rows.push(["USUBJID", "AEDECOD", "ASTDT", "TRTSDT", "TRTEDT"]);
      var terms = ["Headache", "Nausea", "Fatigue", "Rash"];
      for (i = 1; i <= 24; i++) rows.push(["S" + pad(1 + (i % 12)), terms[Math.floor(r() * 4)], "2026-02-" + pad(1 + Math.floor(r() * 27)), "2026-02-01", "2026-03-15"]);
    }
    return rows;
  }
  function bump(row, task) {
    if (task === "ae") row[2] = row[2] === "2026-02-28" ? "2026-02-27" : "2026-02-28";
    else { var c = task === "km" ? 2 : 4; row[c] = String(Number(row[c]) + 1); }
  }
  function datasetText(task, ver, changeOne) {
    var rows = dataRows(task).map(function (x) { return x.slice(); });
    if (ver === "v3") {
      bump(rows[5], task);
      rows.push(rows[rows.length - 1].slice()); rows[rows.length - 1][0] = "S99";
    }
    if (changeOne) bump(rows[3], task);
    return rows.map(function (x) { return x.join(","); }).join("\n") + "\n";
  }
  function envText(task, bumped) {
    var p = TASKS[task].pkg.split(" ");
    return "R 4.4.2; " + p[0] + " " + (bumped ? p[1].replace(/\d+$/, function (n) { return String(Number(n) + 1); }) : p[1]);
  }

  function bumpText(text, task) {
    var rows = text.trim().split("\n").map(function (x) { return x.split(","); });
    bump(rows[3], task);
    return rows.map(function (x) { return x.join(","); }).join("\n") + "\n";
  }
  function bumpEnv(s) { return s.replace(/\d+$/, function (n) { return String(Number(n) + 1); }); }
  function rvStatus() {
    var n = $("rv-status");
    if (!S.reviewDone && !S.stale) { n.hidden = true; return; }
    n.hidden = false;
    n.className = "rv-status " + (S.stale ? "is-stale" : "is-current");
    n.textContent = S.stale
      ? "Review status: STALE. The " + S.pending.diff.join(" and ") + " changed after this review, so it no longer covers the current run."
      : "Review status: current. It covers data " + RP.short(S.dataHash) + " and environment " + RP.short(S.envHash) + ".";
  }

  function refresh() {
    return RP.renderChain(chain, $("wb-entries"), $("wb-status"), {
      clock: true,
      empty: "No entries yet. Record the scope to start the chain.",
      after: function (v) {
        verified = v.bad === -1;
        var box = $("wb-entries");
        if (chain.entries.length > shown) box.scrollTop = box.scrollHeight;
        shown = chain.entries.length;
        $("btn-export-json").disabled = !chain.entries.length;
        $("btn-export-md").disabled = !chain.entries.length;
      }
    });
  }
  function lock(id, on) { $(id).setAttribute("data-locked", on ? "true" : "false"); }
  function verdict(id, kind, text) {
    var v = $(id); v.hidden = !text; v.className = "verdict " + kind; v.textContent = text || "";
  }
  function pressed(container, key) {
    [].forEach.call($(container).querySelectorAll(".pill"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-k") === key ? "true" : "false"); });
  }
  function done(btn, text) { btn.disabled = true; btn.textContent = text; btn.classList.add("is-done"); }
  function norm(n) { return n.replace(/\s+/g, " ").trim(); }
  function clean(t) { return norm(t).replace(/[|\n\r]/g, "/").slice(0, 120); }
  function tasks() { return $("task-pills").querySelectorAll(".pill"); }

  function initWb() {
    chain = new RP.Chain();
    S = { task: "cfb", scoped: false, draft: "", final: "", finalHash: "", dataHash: "", envHash: "", dataText: "", decisions: [], needed: 1, rejected: false, reviewDone: false, ver: "v3", env: "", stale: false, pending: null, round: 0, replays: 0, lastKey: "" };
    shown = 0; $("rv-status").hidden = true; $("btn-rereview").hidden = true;
    pressed("task-pills", "cfb"); pressed("data-pills", "v3");
    [].forEach.call(tasks(), function (b) { b.disabled = false; });
    [].forEach.call($("data-pills").querySelectorAll(".pill"), function (b) { b.disabled = false; });
    $("tier").disabled = false; $("tier").value = "support";
    $("note-tier").textContent = "Illustrative rule: one named reviewer is enough for this context of use.";
    [["btn-scope", "Record scope"], ["btn-draft", "Generate draft"], ["btn-data", "Record data and environment"]].forEach(function (x) {
      var b = $(x[0]); b.disabled = false; b.textContent = x[1]; b.classList.remove("is-done");
    });
    $("reviewer").value = "asmith"; $("reviewer").disabled = false; $("reason").value = ""; $("reason").disabled = false;
    $("edit-wrap").hidden = true; $("drift").checked = false; $("datadrift").checked = false;
    [].forEach.call($("seg-review").querySelectorAll("button"), function (b) { b.disabled = false; });
    $("codeview").textContent = "The draft appears here once generated.";
    $("promptview").textContent = "Write R code: " + TASKS.cfb.title;
    $("data-preview").hidden = true; $("data-preview").textContent = "";
    ["rv-verdict", "data-verdict", "replay-verdict"].forEach(function (i) { verdict(i, "info", ""); });
    lock("st-data", true); lock("st-draft", true); lock("st-review", true); lock("st-replay", true);
    refresh();
  }

  $("task-pills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill"); if (!b || S.scoped) return;
    S.task = b.getAttribute("data-k"); pressed("task-pills", S.task);
    $("promptview").textContent = "Write R code: " + TASKS[S.task].title;
  });
  $("tier").addEventListener("change", function () {
    var t = TIERS[$("tier").value];
    $("note-tier").textContent = t[1] === 2
      ? "Illustrative rule: a primary analysis needs two different reviewers before it counts as reviewed."
      : "Illustrative rule: one named reviewer is enough for this context of use.";
  });
  $("btn-scope").addEventListener("click", function () {
    if (S.scoped) return;
    S.scoped = true;
    var tier = $("tier").value; S.needed = TIERS[tier][1];
    done($("btn-scope"), "Scope recorded"); $("tier").disabled = true;
    [].forEach.call(tasks(), function (b) { b.disabled = true; });
    chain.append("Task scoped: " + TASKS[S.task].title, SCOPER, "context=" + TIERS[tier][0] + "; reviewers required=" + S.needed).then(refresh);
    lock("st-data", false);
  });

  /* Data and environment are fixed before any code is drafted or reviewed. */
  $("data-pills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill"); if (!b || $("btn-data").disabled) return;
    S.ver = b.getAttribute("data-k"); pressed("data-pills", S.ver);
  });
  $("btn-data").addEventListener("click", function () {
    var ds = TASKS[S.task].ds, text = datasetText(S.task, S.ver, false), env = envText(S.task, false);
    var nrows = text.trim().split("\n").length - 1;
    done($("btn-data"), "Data and environment recorded");
    [].forEach.call($("data-pills").querySelectorAll(".pill"), function (b) { b.disabled = true; });
    S.dataText = text; S.env = env;
    $("data-preview").textContent = text.split("\n").slice(0, 4).join("\n") + "\n…  (" + nrows + " rows, synthetic)";
    $("data-preview").hidden = false;
    Promise.all([RP.sha(text), RP.sha(env)]).then(function (h) {
      S.dataHash = h[0]; S.envHash = h[1];
      return chain.append("Input data fingerprinted: " + ds + " " + S.ver, "system", "rows=" + nrows + "; data_sha256=" + RP.short(h[0]))
        .then(function () { return chain.append("Environment recorded: " + env + " (illustrative)", "system", "env_sha256=" + RP.short(h[1])); });
    }).then(function () {
      refresh(); lock("st-draft", false);
      verdict("data-verdict", "ok", "Recorded " + ds + " " + S.ver + " (" + nrows + " rows) and the environment.");
    });
  });

  /* Simulated draft: canned code streamed in. No model is called. */
  $("btn-draft").addEventListener("click", function () {
    var code = TASKS[S.task].code, view = $("codeview"), i = 0, prompt = $("promptview").textContent;
    $("btn-draft").disabled = true; view.textContent = "";
    var caret = el("span", "caret"); view.appendChild(caret);
    function finish() {
      view.textContent = code;
      S.draft = code; S.final = code;
      Promise.all([RP.sha(prompt), RP.sha(code)]).then(function (h) {
        S.finalHash = h[1];
        return chain.append("AI draft captured: prompt, model, output", "assistant",
          "model=simulated-model-0; prompt_sha256=" + RP.short(h[0]) + "; output_sha256=" + RP.short(h[1]));
      }).then(function () { done($("btn-draft"), "Draft captured"); refresh(); lock("st-review", false); });
    }
    if (RP.reduce) { finish(); return; }
    var timer = setInterval(function () {
      i += 3;
      view.textContent = code.slice(0, i); view.appendChild(caret);
      if (i >= code.length) { clearInterval(timer); finish(); }
    }, 18);
  });

  function record(name, kind, code, reason, before) {
    return RP.sha(code).then(function (h) {
      S.finalHash = h; S.decisions.push({ name: name, kind: kind });
      var d = "reviewer " + S.decisions.length + " of " + S.needed;
      if (kind === "edited") d += "; reason=" + reason + "; code_sha256_before=" + RP.short(before) + "; code_sha256_after=" + RP.short(h);
      else d += "; code_sha256=" + RP.short(h);
      d += "; data_sha256=" + RP.short(S.dataHash);
      return chain.append((S.round ? "Re-review decision: " : "Review decision: ") + kind, name, d);
    }).then(function () {
      refresh();
      if (S.decisions.length >= S.needed) {
        S.reviewDone = true;
        var base = "Review complete: " + S.decisions.length + " of " + S.needed + " reviewer decisions recorded.", t = TASKS[S.task], last = S.decisions[S.decisions.length - 1].kind;
        if (t.bug) {
          var fixed = t.fix.test(S.final);
          if (fixed) verdict("rv-verdict", "ok", base + " Your edit fixes the planted error in this draft (Surv(AVAL, 1 - CNSR)). The log keeps the before and after fingerprints and your reason.");
          else verdict("rv-verdict", "warn", base + " Planted error, still in the code: " + t.bug + " The log proves who decided and what they saw. It cannot show that the review was careful.");
        } else verdict("rv-verdict", "ok", base);
        rvStatus();
        [].forEach.call($("seg-review").querySelectorAll("button"), function (b) { b.disabled = true; });
        $("reviewer").disabled = true; $("reason").disabled = true;
        lock("st-replay", false);
      } else {
        verdict("rv-verdict", "info", "Reviewer " + S.decisions.length + " recorded. A second, different reviewer is needed.");
        $("reviewer").value = "bjones"; $("reason").value = "";
      }
    });
  }
  function reviewerName() {
    var name = norm($("reviewer").value);
    if (!name) { verdict("rv-verdict", "bad", "Enter the reviewer's name first."); return ""; }
    var low = name.toLowerCase();
    if (low === SCOPER) { verdict("rv-verdict", "bad", "The reviewer must be a different person from " + SCOPER + ", who scoped the task."); return ""; }
    if (S.decisions.some(function (d) { return norm(d.name).toLowerCase() === low; })) {
      verdict("rv-verdict", "bad", "Use a different reviewer for the second decision."); return "";
    }
    return name.replace(/\|/g, "/");
  }
  function needReason() {
    var r = clean($("reason").value);
    if (!r) verdict("rv-verdict", "bad", "Give a reason for an edit or a rejection.");
    return r;
  }
  function decide(kind) {
    if (S.rejected || S.reviewDone) return;
    var name = reviewerName(); if (!name) return;
    if (kind === "rejected") {
      var why = needReason(); if (!why) return;
      S.rejected = true;
      chain.append("Review decision: rejected", name, "reviewer " + (S.decisions.length + 1) + " of " + S.needed + "; reason=" + why).then(refresh);
      verdict("rv-verdict", "bad", "Draft rejected by " + name + ". A rejected draft cannot be replayed. Reset to try again." + (TASKS[S.task].bug ? " This draft did contain a planted error: " + TASKS[S.task].bug : ""));
      [].forEach.call($("seg-review").querySelectorAll("button"), function (b) { b.disabled = true; });
      return;
    }
    if (kind === "edited") { if (!needReason()) return; verdict("rv-verdict", "info", ""); $("edit-area").value = S.final; $("edit-wrap").hidden = false; $("edit-area").focus(); return; }
    record(name, "accepted", S.final);
  }
  $("rv-accept").addEventListener("click", function () { decide("accepted"); });
  $("rv-edit").addEventListener("click", function () { decide("edited"); });
  $("rv-reject").addEventListener("click", function () { decide("rejected"); });
  $("btn-submit-edit").addEventListener("click", function () {
    var text = $("edit-area").value.replace(/\s+$/, "");
    if (!text.trim()) { verdict("rv-verdict", "bad", "The edited code cannot be empty."); return; }
    if (text === S.final) { verdict("rv-verdict", "bad", "The code is unchanged. Edit it, or use Accept."); return; }
    var name = reviewerName(); if (!name) return;
    var why = needReason(); if (!why) return;
    var before = S.finalHash;
    S.final = text; $("edit-wrap").hidden = true;
    $("codeview").textContent = text;
    record(name, "edited", text, why, before);
  });

  /* Replay: recompute the three fingerprints and say which one differs.
     A difference after a review makes that review stale until someone reviews the new state. */
  $("btn-replay").addEventListener("click", function () {
    var pkgDrift = $("drift").checked, dataDrift = $("datadrift").checked;
    var text = dataDrift ? bumpText(S.dataText, S.task) : S.dataText, env = pkgDrift ? bumpEnv(S.env) : S.env;
    Promise.all([RP.sha(S.final), RP.sha(text), RP.sha(env)]).then(function (h) {
      var diff = [];
      if (h[0] !== S.finalHash) diff.push("code");
      if (h[1] !== S.dataHash) diff.push("data");
      if (h[2] !== S.envHash) diff.push("environment");
      var match = !diff.length, key = h.join("|");
      if (key === S.lastKey) { verdict("replay-verdict", "info", "Same fingerprints as the last replay, so nothing new was logged. Change an input, or tick neither box for a clean pass."); return; }
      S.lastKey = key; S.replays++;
      var inputs = [pkgDrift ? "package version changed" : "", dataDrift ? "one data value edited" : ""].filter(Boolean);
      var title = "Replay check " + S.replays + ": " + (match ? "fingerprints match" : "difference detected (" + diff.join(", ") + ")");
      var detail = "simulated=" + (inputs.length ? inputs.join(" + ") : "nothing") + "; code_sha256=" + RP.short(h[0]) + "; data_sha256=" + RP.short(h[1]) + "; env_sha256=" + RP.short(h[2]);
      var p = chain.append(title, "system", detail);
      if (!match) {
        var first = !S.stale;
        S.stale = true; S.pending = { diff: diff, text: text, env: env, dataHash: h[1], envHash: h[2] };
        if (first) p = p.then(function () {
          return chain.append("Review marked stale: " + diff.join(", ") + " changed since the review", "system",
            "review covered code_sha256=" + RP.short(S.finalHash) + "; data_sha256=" + RP.short(S.dataHash) + "; new review required");
        });
      }
      p.then(function () { refresh(); rvStatus(); });
      if (match) {
        verdict("replay-verdict", "ok", S.stale
          ? "These match the logged fingerprints, but an earlier replay already marked the review stale. The log keeps that mark: record a new review, or Reset."
          : "Code, data and environment fingerprints all match the logged ones. The review still covers this run.");
        $("btn-rereview").hidden = !S.stale;
      } else {
        verdict("replay-verdict", "bad", "The " + diff.join(" and ") + " fingerprint differs from the logged one, so the review no longer covers this run. It is now marked stale. This is what the reproducr package's drift detection flags.");
        $("btn-rereview").hidden = false;
      }
    });
  });

  /* Adopt the changed state and ask for a new review of it. */
  $("btn-rereview").addEventListener("click", function () {
    var q = S.pending; if (!q) return;
    chain.append("Fingerprints re-recorded after change: " + q.diff.join(", "), "system",
      "data_sha256=" + RP.short(q.dataHash) + "; env_sha256=" + RP.short(q.envHash) + "; the earlier review does not cover these").then(function () {
      S.dataText = q.text; S.env = q.env; S.dataHash = q.dataHash; S.envHash = q.envHash;
      S.stale = false; S.pending = null; S.reviewDone = false; S.rejected = false; S.decisions = []; S.round++; S.lastKey = "";
      $("data-preview").textContent = q.text.split("\n").slice(0, 4).join("\n") + "\n…  (" + (q.text.trim().split("\n").length - 1) + " rows, synthetic)";
      [].forEach.call($("seg-review").querySelectorAll("button"), function (b) { b.disabled = false; });
      $("reviewer").disabled = false; $("reason").disabled = false; $("reason").value = ""; $("edit-wrap").hidden = true;
      $("drift").checked = false; $("datadrift").checked = false;
      verdict("replay-verdict", "info", ""); $("btn-rereview").hidden = true; lock("st-replay", true);
      verdict("rv-verdict", "info", "Re-review needed: the earlier decision covered the earlier fingerprints. Record a new decision for the current ones.");
      rvStatus(); refresh();
      $("st-review").scrollIntoView({ behavior: RP.reduce ? "auto" : "smooth", block: "center" });
    });
  });

  $("btn-export-json").addEventListener("click", function () {
    RP.download("reprosia-demo-audit-log.json", JSON.stringify(chain.export(verified), null, 2), "application/json");
  });
  $("btn-export-md").addEventListener("click", function () {
    var lines = ["# Audit summary (browser demo)", "", "Generated: " + new Date().toISOString(),
      "Chain verification: " + (verified ? "intact" : "BROKEN"), "",
      "| # | Time (UTC) | Actor | Event | Hash |", "|---|---|---|---|---|"];
    chain.entries.forEach(function (e) { lines.push("| " + e.seq + " | " + e.ts + " | " + e.actor + " | " + e.orig.replace(/\|/g, "/") + " | `" + RP.short(e.hash) + "` |"); });
    lines.push("", "Each hash is SHA-256 of the previous hash followed by `seq|timestamp|actor|event|detail` (full text in the JSON export). Hash chains reveal edits; they do not prevent them.",
      "", "This summary comes from a simulation in the Reprosia browser demo. No model was called and the log is not regulog output.");
    RP.download("reprosia-demo-audit-summary.md", lines.join("\n"), "text/markdown");
  });
  $("btn-reset").addEventListener("click", initWb);
  initWb();

  /* ---------------- Readiness check ---------------- */
  var Q = [
    { p: "Human-centric by design", t: "Does a named person review every AI output before it is used, with the decision recorded?", a: "Log each reviewer and decision next to the AI output.", s: "regulog's user-attributed log; AI review capture is in development." },
    { p: "Risk-based approach", t: "Do you set the level of review according to how the output will be used?", a: "Define review tiers, for example one reviewer for exploratory work and two for primary analyses.", s: "Consulting support. The workbench shows an illustrative tiering rule." },
    { p: "Adherence to standards", t: "Do your existing GxP and quality-system controls cover AI-assisted work, audit trails included?", a: "Extend your SOPs to AI-assisted analysis and decide which AI records fall under 21 CFR Part 11.", s: "regulog is designed around 21 CFR Part 11 and EU Annex 11." },
    { p: "Clear context of use", t: "Is the task and scope of each AI tool written down?", a: "Write a one-page context of use for each AI tool: tasks allowed, tasks excluded, data it may see.", s: "Consulting and templates." },
    { p: "Multidisciplinary expertise", t: "Do statistics, QA and IT review AI use together?", a: "Set up a joint review of AI use with statistics, QA and IT.", s: "Training and workshops." },
    { p: "Data governance", t: "Can you show which data version and exclusions each AI-assisted run used?", a: "Record a data fingerprint and the exclusions with every run.", s: "lineager traces rows and exclusions." },
    { p: "Traceable development", t: "Are R and package versions frozen and recorded for each run?", a: "Lock dependencies and capture the session for each run.", s: "reproducr captures sessions and locks dependencies." },
    { p: "Performance assessment", t: "Do you check AI-assisted results against acceptance criteria set in advance?", a: "Agree acceptance criteria before the work starts, and compare the results to them.", s: "reproducr flags drift. Model-specific metrics are not covered." },
    { p: "Lifecycle management", t: "Do you re-check results when the model, the packages or the data change?", a: "Add a re-run and compare step to your change-control process.", s: "reproducr drift detection helps. Change control stays with you." },
    { p: "Clear information", t: "Are intended use and limits documented where reviewers will see them?", a: "Publish a short description of intended use and limits with each analysis.", s: "lineager and bayprior generate structured reports." }
  ];
  var VAL = [["Yes", 2], ["Partly", 1], ["No", 0]];
  var ans = [];
  function renderQ() {
    var box = $("rd-questions"); box.innerHTML = "";
    Q.forEach(function (q, i) {
      var wrap = el("div", "q");
      var p = el("p", "q-text"); p.appendChild(el("span", "q-tag", "P" + (i + 1))); p.appendChild(document.createTextNode(q.t));
      var seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Answer for principle " + (i + 1));
      VAL.forEach(function (v) {
        var b = el("button", null, v[0]); b.type = "button";
        b.setAttribute("aria-pressed", ans[i] === v[1] ? "true" : "false");
        b.addEventListener("click", function () { ans[i] = v[1]; renderQ(); });
        seg.appendChild(b);
      });
      wrap.appendChild(p); wrap.appendChild(seg); box.appendChild(wrap);
    });
    var n = ans.filter(function (a) { return a !== undefined; }).length;
    $("rd-progress").textContent = n + " of " + Q.length + " answered";
    $("btn-rd-result").disabled = n < Q.length;
  }
  function radar(scores) {
    var NS = "http://www.w3.org/2000/svg", C = 170, R = 100, svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 340 340"); svg.setAttribute("class", "radar"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Radar chart of readiness scores for the ten principles");
    function pt(i, f) { var a = -Math.PI / 2 + i * 2 * Math.PI / 10; return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f]; }
    [0.5, 1].forEach(function (f) {
      var poly = document.createElementNS(NS, "polygon");
      poly.setAttribute("points", Q.map(function (_, i) { return pt(i, f).join(","); }).join(" "));
      poly.setAttribute("fill", "none"); poly.setAttribute("stroke", "currentColor"); poly.setAttribute("stroke-opacity", "0.25");
      svg.appendChild(poly);
    });
    Q.forEach(function (_, i) {
      var p = pt(i, 1), ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", C); ln.setAttribute("y1", C); ln.setAttribute("x2", p[0]); ln.setAttribute("y2", p[1]);
      ln.setAttribute("stroke", "currentColor"); ln.setAttribute("stroke-opacity", "0.15"); svg.appendChild(ln);
      var l = pt(i, 1.2), t = document.createElementNS(NS, "text");
      t.setAttribute("x", l[0]); t.setAttribute("y", l[1] + 4); t.setAttribute("text-anchor", "middle"); t.textContent = "P" + (i + 1);
      svg.appendChild(t);
    });
    var shape = document.createElementNS(NS, "polygon");
    shape.setAttribute("points", scores.map(function (s, i) { return pt(i, Math.max(s / 2, 0.04)).join(","); }).join(" "));
    shape.style.fill = "var(--accent)"; shape.style.fillOpacity = "0.22"; shape.style.stroke = "var(--accent)"; shape.setAttribute("stroke-width", "2");
    svg.appendChild(shape);
    return svg;
  }
  var lastReport = "";
  function showResult() {
    var total = ans.reduce(function (a, b) { return a + b; }, 0), pct = Math.round(total / (Q.length * 2) * 100);
    var label = pct >= 80 ? "Strong evidence base" : pct >= 50 ? "Partly in place" : "Early stage";
    $("rd-score").textContent = pct + "%"; $("rd-label").textContent = label;
    $("rd-radar").innerHTML = ""; $("rd-radar").appendChild(radar(ans));
    var gaps = Q.map(function (q, i) { return { q: q, i: i, s: ans[i] }; }).filter(function (g) { return g.s < 2; })
      .sort(function (a, b) { return a.s - b.s || a.i - b.i; });
    var ul = $("rd-gaps"); ul.innerHTML = "";
    if (!gaps.length) { var li0 = el("li"); li0.appendChild(el("strong", null, "No gaps flagged")); li0.appendChild(el("span", null, "Every answer was Yes. Keep the evidence current as models, packages and data change.")); ul.appendChild(li0); }
    gaps.forEach(function (g) {
      var li = el("li");
      li.appendChild(el("strong", null, "P" + (g.i + 1) + " " + g.q.p + (g.s === 0 ? " (not in place)" : " (partly in place)")));
      li.appendChild(el("span", null, g.q.a + " Support: " + g.q.s));
      ul.appendChild(li);
    });
    var md = ["# AI-assisted analysis: evidence readiness", "", "Indicative score: " + pct + "% (" + label + ")", "",
      "Self-assessed against ten principles. This is a conversation starter, not an audit.", "", "| Principle | Answer |", "|---|---|"];
    Q.forEach(function (q, i) { md.push("| P" + (i + 1) + " " + q.p + " | " + VAL.filter(function (v) { return v[1] === ans[i]; })[0][0] + " |"); });
    md.push("", "## Gaps to close", "");
    gaps.forEach(function (g) { md.push("- **P" + (g.i + 1) + " " + g.q.p + ":** " + g.q.a + " Support: " + g.q.s); });
    md.push("", "Principles paraphrase a third-party summary of the January 2026 FDA and EMA guiding principles. Check the official text.");
    lastReport = md.join("\n");
    $("rd-mailto").href = "mailto:team@reprosia.com?subject=" + encodeURIComponent("Evidence readiness: " + pct + "%") +
      "&body=" + encodeURIComponent(lastReport.slice(0, 1500));
    $("rd-result").hidden = false; $("rd-intro").hidden = true;
    $("rd-result").scrollIntoView({ behavior: RP.reduce ? "auto" : "smooth", block: "start" });
  }
  $("btn-rd-result").addEventListener("click", showResult);
  $("btn-rd-md").addEventListener("click", function () { RP.download("ai-evidence-readiness.md", lastReport, "text/markdown"); });
  $("btn-rd-reset").addEventListener("click", function () { ans = []; $("rd-result").hidden = true; $("rd-intro").hidden = false; renderQ(); });
  renderQ();

  /* ---------------- Evidence search (keyword retrieval, not a chatbot) ---------------- */
  var kb = [];
  try { kb = JSON.parse($("kb").textContent); } catch (e) { kb = []; }
  var STOP = "a an and are as at be by can do does for from how i in is it of on or our so that the this to we what when which who with you your".split(" ");
  var GROUPS = [
    ["audit", "log", "trail", "record", "ledger", "logging"],
    ["review", "reviewer", "signoff", "sign", "approve", "accept", "reject", "oversight", "human"],
    ["replay", "rerun", "reproduce", "repeat", "reproducible", "reproducibility", "drift"],
    ["data", "provenance", "lineage", "dataset", "exclusion", "row", "governance"],
    ["compliant", "compliance", "part11", "annex", "regulation", "cfr", "gxp", "validated", "validation"],
    ["model", "llm", "ai", "assistant", "agent", "gpt", "chatbot"],
    ["tamper", "alter", "hash", "chain", "verify", "integrity", "sha"],
    ["submit", "submission", "ectd", "define", "cdisc", "reviewer's"],
    ["sas", "migration", "migrate"],
    ["bayesian", "prior", "bayprior"],
    ["fda", "ema", "principle", "guidance", "regulator", "agency"],
    ["contact", "email", "early", "access", "price", "pricing", "cost"],
    ["privacy", "sent", "upload", "secure", "private"]
  ];
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w; }
  function tok(s) {
    return (s.toLowerCase().match(/[a-z0-9']+/g) || []).filter(function (w) { return STOP.indexOf(w) < 0; }).map(stem);
  }
  var syn = {};
  GROUPS.forEach(function (g) { var st = g.map(stem); st.forEach(function (w) { syn[w] = (syn[w] || []).concat(st.filter(function (x) { return x !== w; })); }); });
  var docs = kb.map(function (d) {
    var tf = {}; tok(d.a).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    tok(d.q).forEach(function (w) { tf[w] = (tf[w] || 0) + 3; });
    return { d: d, tf: tf };
  });
  var df = {}; docs.forEach(function (x) { Object.keys(x.tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
  function idf(w) { return Math.log(1 + docs.length / (df[w] || 0.5)); }
  function search(q) {
    var base = tok(q), terms = {};
    base.forEach(function (w) { terms[w] = 1; });
    base.forEach(function (w) { (syn[w] || []).forEach(function (s) { if (!terms[s]) terms[s] = 0.45; }); });
    return docs.map(function (x) {
      var sc = 0; Object.keys(terms).forEach(function (w) { if (x.tf[w]) sc += terms[w] * idf(w) * (1 + Math.log(x.tf[w])); });
      return { d: x.d, s: sc };
    }).filter(function (r) { return r.s > 1.2; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3);
  }
  var SUG = ["Is regulog compliant with Part 11?", "Do you call a language model?", "How does tamper detection work?", "Which records show who reviewed AI output?", "What is not covered?"];
  var chips = $("s-chips");
  SUG.forEach(function (s) {
    var b = el("button", "pill", s); b.type = "button";
    b.addEventListener("click", function () { $("s-input").value = s; run(s); });
    chips.appendChild(b);
  });
  function run(q, keep) {
    var out = $("s-results"); if (!keep) out.innerHTML = "";
    q = q.trim(); if (!q) return;
    var r = search(q);
    if (!r.length) {
      var none = el("div", "result"); none.appendChild(el("h4", null, "No close match"));
      none.appendChild(el("p", null, "Nothing in the answer set fits that question well. Try different words, or email team@reprosia.com."));
      out.appendChild(none); return;
    }
    r.forEach(function (x) {
      var card = el("div", "result");
      card.appendChild(el("h4", null, x.d.q)); card.appendChild(el("p", null, x.d.a));
      var meta = el("div", "meta"); meta.appendChild(el("span", "tag", x.d.src));
      if (x.d.href) { var a = el("a", null, "Read more"); a.href = x.d.href; meta.appendChild(a); }
      card.appendChild(meta); out.appendChild(card);
    });
  }
  $("s-form").addEventListener("submit", function (e) { e.preventDefault(); run($("s-input").value); });

  /* ---------------- Optional AI assistant (off unless RP_ASSISTANT_URL is set) ---------------- */
  var AI_URL = (window.RP_ASSISTANT_URL || "").replace(/\/+$/, "");
  if (AI_URL) {
    var form = $("s-form");
    var aiBtn = el("button", "btn btn-ghost", "Ask the AI assistant (beta)");
    aiBtn.type = "button"; aiBtn.id = "s-ai";
    form.appendChild(aiBtn);
    var lead = $("demo-lead");
    if (lead) lead.textContent = "Three tools. The workbench, the readiness check and the keyword search run entirely on this page: nothing is uploaded, and the AI draft in the workbench is simulated. The exception is the optional AI assistant (beta) on the last tab, which sends your question to a language model.";
    var note = el("p", "note note-warn", "The AI assistant sends your question to a language model (Anthropic) through a Reprosia proxy and answers only from this site's notes. Do not enter confidential or personal data. Answers can be wrong; this is not regulatory advice. Reprosia does not store your question; the model provider processes it under its own terms.");
    form.parentNode.insertBefore(note, $("s-chips"));
    aiBtn.addEventListener("click", function () {
      var q = $("s-input").value.trim();
      if (!q) { $("s-input").focus(); return; }
      var out = $("s-results"); out.innerHTML = "";
      var card = el("div", "result"); card.appendChild(el("h4", null, "Thinking…")); out.appendChild(card);
      aiBtn.disabled = true;
      var ctl = new AbortController(); var to = setTimeout(function () { ctl.abort(); }, 25000);
      fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }), signal: ctl.signal })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          out.innerHTML = "";
          var c = el("div", "result");
          if (!x.ok || !x.d.answer) {
            c.appendChild(el("h4", null, "The assistant could not answer"));
            c.appendChild(el("p", null, (x.d && x.d.error) || "Something went wrong. The keyword search below still works."));
            out.appendChild(c); run(q, true); return;
          }
          c.appendChild(el("h4", null, q));
          var p = el("p", null, x.d.answer); p.style.whiteSpace = "pre-wrap"; c.appendChild(p);
          var meta = el("div", "meta"); meta.appendChild(el("span", "tag", "AI answer, beta")); c.appendChild(meta);
          out.appendChild(c);
          var head = el("p", "note", "Closest written answers from the site:"); out.appendChild(head); run(q, true);
        })
        .catch(function () {
          out.innerHTML = "";
          var c = el("div", "result"); c.appendChild(el("h4", null, "The assistant is unavailable"));
          c.appendChild(el("p", null, "The keyword search still works. Showing its closest matches.")); out.appendChild(c); run(q, true);
        })
        .then(function () { clearTimeout(to); aiBtn.disabled = false; });
    });
  }
})();
