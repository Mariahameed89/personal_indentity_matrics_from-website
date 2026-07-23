/* ===========================================================
   PipelineFlow — demo site logic
   - Cookie consent (Accept / Reject) stored in localStorage
   - Leadpipe pixel injected ONLY after consent, ONLY once
   - Contact form (no backend) with thank-you message
   - Debug panel available at ?debug=true
   =========================================================== */

(function () {
  "use strict";

  /* -----------------------------------------------------------
     CONFIG
     -----------------------------------------------------------
     The ONLY place you edit to swap in a new Leadpipe pixel.
     Do NOT modify the script string itself — just the URL below.
     Provided pixel:
       <script src="https://leadpipe.aws53.cloud/p/c801e1ba-dfe5-4c5e-b34a-ce2c53bd990b.js" async></script>
  */
  var LEADPIPE_PIXEL_SRC =
    "https://leadpipe.aws53.cloud/p/c801e1ba-dfe5-4c5e-b34a-ce2c53bd990b.js";

  var CONSENT_KEY = "pf_consent"; // "accepted" | "rejected"
  var PIXEL_DOM_ID = "leadpipe-pixel";

  // Simple query helpers
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------------- Consent state ---------------- */
  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); }
    catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }
  function clearConsent() {
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
  }

  /* ---------------- Leadpipe pixel loader ----------------
     Guaranteed to inject at most once (idempotent):
       - in-memory flag
       - checks the DOM for an existing element by id
  */
  var pixelInjected = false;

  function isPixelLoaded() {
    return pixelInjected || !!document.getElementById(PIXEL_DOM_ID);
  }

  function loadLeadpipePixel() {
    if (isPixelLoaded()) {
      return false; // already loaded — do nothing (prevents duplicates)
    }
    pixelInjected = true;

    var s = document.createElement("script");
    s.id = PIXEL_DOM_ID;
    s.src = LEADPIPE_PIXEL_SRC;
    s.async = true;
    s.setAttribute("data-leadpipe", "true");
    s.onload = function () {
      console.log("Leadpipe pixel loaded");
      dbgLog("Pixel onload fired.");
      refreshDebug();
    };
    s.onerror = function () {
      console.warn("[Leadpipe] pixel failed to load (network/ad-blocker?)");
      dbgLog("Pixel FAILED to load (blocked or network error).");
      refreshDebug();
    };
    (document.head || document.documentElement).appendChild(s);

    // Log immediately on injection as well (the requirement asks to log on Accept).
    console.log("Leadpipe pixel loaded");
    refreshDebug();
    return true;
  }

  /* ---------------- Custom event helper ----------------
     Leadpipe does not publish a documented client-side custom-event
     API at the time of writing. Rather than invent one, we probe a
     few common integration shapes and fall back to a dataLayer-style
     queue. This is safe and honest: if Leadpipe exposes an API, we
     use it; otherwise the event is queued and logged.
  */
  function leadpipeTrack(eventName, payload) {
    payload = payload || {};
    if (getConsent() !== "accepted") {
      console.info("[Leadpipe] event skipped (no consent):", eventName);
      return "skipped-no-consent";
    }
    try {
      var lp = window.leadpipe || window.Leadpipe || window.lp;
      if (lp && typeof lp.track === "function") {
        lp.track(eventName, payload);
        return "sent:native";
      }
      if (lp && typeof lp.push === "function") {
        lp.push({ event: eventName, data: payload });
        return "sent:push";
      }
      if (Array.isArray(window.leadpipeQueue)) {
        window.leadpipeQueue.push([eventName, payload]);
        return "sent:queue";
      }
      // Fallback queue a pixel could read later.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "leadpipe_" + eventName, data: payload });
      console.info("[Leadpipe] No native custom-event API detected — queued:", eventName, payload);
      return "queued:dataLayer";
    } catch (e) {
      console.warn("[Leadpipe] event error", e);
      return "error";
    }
  }

  /* ---------------- Cookie banner ---------------- */
  var banner = $("#cookieBanner");

  function showBanner() { if (banner) banner.hidden = false; }
  function hideBanner() { if (banner) banner.hidden = true; }

  function onAccept() {
    setConsent("accepted");
    hideBanner();
    loadLeadpipePixel();          // dynamic load after consent
    updateFooterConsent();
    refreshDebug();
  }

  function onReject() {
    setConsent("rejected");
    hideBanner();
    console.log("Leadpipe tracking rejected");
    updateFooterConsent();
    refreshDebug();
  }

  function initConsent() {
    var consent = getConsent();
    if (consent === "accepted") {
      // Returning visitor who already accepted — load without showing banner.
      loadLeadpipePixel();
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
        clearConsent();
        // Note: an already-injected pixel cannot be "unloaded" without a reload.
        updateFooterConsent();
        refreshDebug();
        location.reload();
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

      // Fire a Leadpipe custom "lead" event (only sends if consent === accepted).
      var result = leadpipeTrack("lead_submitted", {
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
        // Let the anchor scroll to #contact, then focus the first field.
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
    setText("#dbgPixel", isPixelLoaded() ? "yes" : "no");
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
    // Keep the timestamp fresh.
    setInterval(function () { setText("#dbgTime", nowStamp()); }, 1000);

    $("#debugClose").addEventListener("click", function () { panel.hidden = true; });

    $("#dbgPageView").addEventListener("click", function () {
      var r = leadpipeTrack("page_view", { page: location.pathname, ts: nowStamp() });
      dbgLog("page_view → " + r);
      refreshDebug();
    });

    $("#dbgLead").addEventListener("click", function () {
      var r = leadpipeTrack("lead", { source: "debug-panel", ts: nowStamp() });
      dbgLog("lead → " + r);
      refreshDebug();
    });

    $("#dbgClear").addEventListener("click", function () {
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
