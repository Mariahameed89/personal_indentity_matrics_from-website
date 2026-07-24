/* ===========================================================
   PipelineFlow — demo site logic
   Consent-gated visitor-identification trackers:
     - VisiLead  (ACTIVE)   — native manual-consent mode
     - Leadpipe  (DISABLED) — old pixel tied to a different domain
     - Warmly    (PENDING)  — awaiting token
   Nothing contacts any tracker until the visitor clicks "Accept".
   Each tracker is injected at most once (no duplicate loading).
   =========================================================== */

(function () {
  "use strict";

  /* -----------------------------------------------------------
     TRACKER CONFIG — the only place you edit to add/swap pixels.
     ----------------------------------------------------------- */

  // VisiLead — registered for websitetracking-five.vercel.app.
  // Injected with data-consent="manual": it stores/tracks NOTHING
  // until we call visilead.consent() (done only after Accept).
  var VISILEAD = {
    enabled: true,
    src: "https://visilead.co/tracker.js",
    id: "vl_e9daa1375a07"
  };

  // Leadpipe — DISABLED: this pixel is tied to a different expected
  // domain and will NOT verify on this URL. To use it: generate a
  // Leadpipe pixel for THIS domain, paste its src below, enabled:true.
  var LEADPIPE = {
    enabled: false,
    src: "https://leadpipe.aws53.cloud/p/c801e1ba-dfe5-4c5e-b34a-ce2c53bd990b.js"
  };

  // Warmly.ai — PENDING: paste the snippet's src (and id if any) when
  // it arrives, then set enabled: true. Loader stub is below.
  var WARMLY = {
    enabled: false,
    src: "",   // e.g. "https://opps-widget.getwarmly.com/warmly.js?clientId=..."
    id: ""
  };

  var CONSENT_KEY = "pf_consent"; // "accepted" | "rejected"

  // Query helpers
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------------- Consent state ---------------- */
  function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {} }
  function clearConsent() { try { localStorage.removeItem(CONSENT_KEY); } catch (e) {} }

  /* ---------------- Tracker loaders ----------------
     Idempotent: an in-memory flag + a DOM id check guarantee each
     tracker is injected at most once (prevents duplicate loading).
  */
  var loaded = { visilead: false, leadpipe: false, warmly: false };

  function injectScript(opts) {
    if (document.getElementById(opts.id)) return null;
    var s = document.createElement("script");
    s.id = opts.id;
    s.src = opts.src;
    if (opts.async) { s.async = true; } else { s.defer = true; }
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) { s.setAttribute(k, opts.attrs[k]); });
    }
    if (opts.onload) s.onload = opts.onload;
    if (opts.onerror) s.onerror = opts.onerror;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  /* --- VisiLead --- */
  function callVisileadConsent(attempt) {
    attempt = attempt || 0;
    try {
      if (window.visilead && typeof window.visilead.consent === "function") {
        window.visilead.consent();
        console.log("VisiLead pixel loaded — consent granted");
        refreshDebug();
        return;
      }
    } catch (e) { console.warn("[VisiLead] consent() error", e); return; }
    // The global may initialise slightly after onload — retry briefly.
    if (attempt < 20) {
      setTimeout(function () { callVisileadConsent(attempt + 1); }, 150);
    } else {
      console.warn("[VisiLead] consent() API not available after load");
    }
  }

  function loadVisiLead() {
    if (!VISILEAD.enabled) return false;
    if (loaded.visilead || document.getElementById("visilead-pixel")) return false;
    loaded.visilead = true;
    injectScript({
      id: "visilead-pixel",
      src: VISILEAD.src,
      attrs: { "data-id": VISILEAD.id, "data-consent": "manual" },
      onload: function () { callVisileadConsent(0); refreshDebug(); },
      onerror: function () { console.warn("[VisiLead] failed to load (ad-blocker/network?)"); refreshDebug(); }
    });
    return true;
  }

  function revokeVisiLead() {
    try {
      if (window.visilead && typeof window.visilead.revokeConsent === "function") {
        window.visilead.revokeConsent();
        console.log("VisiLead consent revoked — visitor ID deleted from browser");
      }
    } catch (e) {}
  }

  /* --- Leadpipe (disabled until a domain-matched pixel is provided) --- */
  function loadLeadpipe() {
    if (!LEADPIPE.enabled) return false;
    if (loaded.leadpipe || document.getElementById("leadpipe-pixel")) return false;
    loaded.leadpipe = true;
    injectScript({
      id: "leadpipe-pixel",
      src: LEADPIPE.src,
      async: true,
      attrs: { "data-leadpipe": "true" },
      onload: function () { console.log("Leadpipe pixel loaded"); refreshDebug(); },
      onerror: function () { console.warn("[Leadpipe] failed to load"); refreshDebug(); }
    });
    console.log("Leadpipe pixel loaded");
    return true;
  }

  /* --- Warmly (stub; fill WARMLY config + enable when token arrives) --- */
  function loadWarmly() {
    if (!WARMLY.enabled || !WARMLY.src) return false;
    if (loaded.warmly || document.getElementById("warmly-pixel")) return false;
    loaded.warmly = true;
    injectScript({
      id: "warmly-pixel",
      src: WARMLY.src,
      attrs: WARMLY.id ? { "data-id": WARMLY.id } : null,
      onload: function () { console.log("Warmly pixel loaded"); refreshDebug(); },
      onerror: function () { console.warn("[Warmly] failed to load"); refreshDebug(); }
    });
    return true;
  }

  function loadAllTrackers() {
    loadVisiLead();
    loadLeadpipe();
    loadWarmly();
  }

  function trackerStatusText() {
    function state(cfg, isLoaded) { return cfg.enabled ? (isLoaded ? "yes" : "armed") : "off"; }
    return "VisiLead: " + state(VISILEAD, loaded.visilead) +
           " · Leadpipe: " + state(LEADPIPE, loaded.leadpipe) +
           " · Warmly: " + state(WARMLY, loaded.warmly);
  }

  /* ---------------- Custom event helper ----------------
     Probes for a provider custom-event API; falls back to a
     dataLayer-style queue. Never fabricates a successful send.
     Only fires when consent === "accepted".
  */
  function trackEvent(eventName, payload) {
    payload = payload || {};
    if (getConsent() !== "accepted") {
      console.info("[track] skipped (no consent):", eventName);
      return "skipped-no-consent";
    }
    try {
      var providers = [window.visilead, window.leadpipe, window.Leadpipe, window.warmly];
      for (var i = 0; i < providers.length; i++) {
        var p = providers[i];
        if (p && typeof p.track === "function") { p.track(eventName, payload); return "sent:native"; }
      }
      // Fallback queue a pixel could read later.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "pf_" + eventName, data: payload });
      console.info("[track] no native custom-event API detected — queued:", eventName, payload);
      return "queued:dataLayer";
    } catch (e) { console.warn("[track] error", e); return "error"; }
  }

  /* ---------------- Cookie banner ---------------- */
  var banner = $("#cookieBanner");
  function showBanner() { if (banner) banner.hidden = false; }
  function hideBanner() { if (banner) banner.hidden = true; }

  function onAccept() {
    setConsent("accepted");
    hideBanner();
    loadAllTrackers();       // dynamic load only after consent
    updateFooterConsent();
    refreshDebug();
  }

  function onReject() {
    setConsent("rejected");
    hideBanner();
    revokeVisiLead();        // no-op if not loaded; ensures nothing lingers
    console.log("Tracking rejected — no visitor-identification pixel loaded");
    updateFooterConsent();
    refreshDebug();
  }

  function initConsent() {
    var consent = getConsent();
    if (consent === "accepted") {
      // Returning visitor who already accepted — load without the banner.
      loadAllTrackers();
      hideBanner();
    } else if (consent === "rejected") {
      hideBanner();
    } else {
      showBanner();
    }
    updateFooterConsent();

    var acceptBtn = $("#acceptCookies");
    var rejectBtn = $("#rejectCookies");
    if (acceptBtn) acceptBtn.addEventListener("click", onAccept);
    if (rejectBtn) rejectBtn.addEventListener("click", onReject);

    var resetBtn = $("#resetConsent");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        revokeVisiLead();     // delete VisiLead's visitor ID before clearing
        clearConsent();
        updateFooterConsent();
        refreshDebug();
        location.reload();    // reload so trackers start fresh on next choice
      });
    }
  }

  function updateFooterConsent() {
    var el = $("#footerConsent");
    if (!el) return;
    var c = getConsent();
    el.textContent = "Consent: " + (c ? c : "not set");
  }

  /* ---------------- Contact form ---------------- */
  function initForm() {
    var form = $("#demoForm");
    var thankyou = $("#thankyou");
    var errorEl = $("#formError");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault(); // never do a real submit — this is a static demo

      var name = $("#name").value.trim();
      var email = $("#email").value.trim();
      var company = $("#company").value.trim();

      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!name || !company || !emailOk) {
        if (errorEl) {
          errorEl.textContent = !emailOk
            ? "Please enter a valid work email."
            : "Please fill in name, work email, and company.";
          errorEl.hidden = false;
        }
        return;
      }
      if (errorEl) errorEl.hidden = true;

      // Fire a custom "lead" event (only sends if consent === accepted).
      var result = trackEvent("lead_submitted", {
        name: name, email: email, company: company, page: location.pathname
      });
      console.log("[PipelineFlow] demo form submitted →", result);

      // Show the thank-you message.
      form.hidden = true;
      if (thankyou) thankyou.hidden = false;
    });

    var resetForm = $("#resetForm");
    if (resetForm) {
      resetForm.addEventListener("click", function () {
        form.reset();
        form.hidden = false;
        if (thankyou) thankyou.hidden = true;
        if (errorEl) errorEl.hidden = true;
      });
    }
  }

  /* ---------------- Demo CTA → focus form ---------------- */
  function initDemoCtas() {
    $all("[data-demo-cta]").forEach(function (a) {
      a.addEventListener("click", function () {
        setTimeout(function () {
          var first = $("#name");
          if (first) first.focus({ preventScroll: true });
        }, 400);
      });
    });
  }

  /* ---------------- Mobile nav ---------------- */
  function initNav() {
    var toggle = $("#navToggle");
    var nav = $(".nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $all(".nav__links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- Debug panel (?debug=true) ---------------- */
  var debugOn = /(?:^|[?&])debug=true(?:&|$)/.test(location.search);

  function dbgLog(msg) {
    if (!debugOn) return;
    var el = $("#dbgLog");
    if (el) el.textContent = msg;
  }

  function nowStamp() {
    var d = new Date();
    return d.toISOString() + " (" + d.toString().replace(/\s*\(.*\)$/, "") + ")";
  }

  function refreshDebug() {
    if (!debugOn) return;
    setText("#dbgUrl", location.href);
    setText("#dbgConsent", getConsent() || "not set");
    setText("#dbgPixel", trackerStatusText());
    setText("#dbgTime", nowStamp());
    setText("#dbgUa", navigator.userAgent);
    setText("#dbgRef", document.referrer || "(none)");
  }

  function setText(sel, val) {
    var el = $(sel);
    if (el) el.textContent = val;
  }

  function initDebug() {
    var panel = $("#debugPanel");
    if (!debugOn || !panel) return;
    panel.hidden = false;
    refreshDebug();
    setInterval(function () { setText("#dbgTime", nowStamp()); }, 1000);

    $("#debugClose").addEventListener("click", function () { panel.hidden = true; });

    $("#dbgPageView").addEventListener("click", function () {
      var r = trackEvent("page_view", { page: location.pathname, ts: nowStamp() });
      dbgLog("page_view → " + r);
      refreshDebug();
    });

    $("#dbgLead").addEventListener("click", function () {
      var r = trackEvent("lead", { source: "debug-panel", ts: nowStamp() });
      dbgLog("lead → " + r);
      refreshDebug();
    });

    $("#dbgClear").addEventListener("click", function () {
      revokeVisiLead();
      clearConsent();
      dbgLog("Consent cleared — reloading…");
      location.reload();
    });
  }

  /* ---------------- Misc ---------------- */
  function initYear() {
    var y = $("#year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------------- Boot ---------------- */
  function init() {
    initConsent();
    initForm();
    initDemoCtas();
    initNav();
    initDebug();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
