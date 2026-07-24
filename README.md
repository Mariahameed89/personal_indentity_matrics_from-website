# PipelineFlow — visitor-identification pixel test site

A small, production-ready **static** website (plain HTML / CSS / JS) whose only
purpose is to test whether visitor-identification pixels (**VisiLead**, and later
Leadpipe / Warmly.ai) actually detect and identify visitors.

**Live:** https://websitetracking-five.vercel.app

It presents a fictional B2B SaaS landing page called **PipelineFlow** and loads
its tracking pixels **only after the visitor accepts analytics cookies**.

> ⚠️ This is a technical test harness, not a real product. PipelineFlow is fictional.

---

## Files

| File | Purpose |
|------|---------|
| `index.html`  | Landing page: nav, hero, features, pricing, contact form, cookie banner, debug panel |
| `styles.css`  | All styling (responsive, mobile + desktop) |
| `script.js`   | Consent logic, dynamic pixel loader, form handling, debug panel |
| `privacy.html`| Privacy policy explaining the pixel and consent |
| `netlify.toml`| Netlify config (no build step) |
| `vercel.json` | Vercel config (no build step) |
| `README.md`   | This file |

No frameworks, no database, no backend, no build step.

---

## Trackers & how they load (important)

| Provider | Status | Notes |
|----------|--------|-------|
| **VisiLead** | ✅ Active | ID `vl_a35bbeff8ef6`, registered for `websitetracking-five.vercel.app` |
| **Leadpipe** | ⏸ Disabled | Existing pixel is tied to a *different* expected domain, so it can't verify here |
| **Warmly.ai** | ⏳ Pending | Awaiting token — will slot into the same consent gate |

No tracker is hard-coded as a live `<script>` tag, because that would load it before
consent. Instead:

1. `index.html` contains a clearly marked, **commented** reference block
   (`VISILEAD PIXEL START/END`, `LEADPIPE PIXEL START/END`, `WARMLY PIXEL START/END`).
   These are documentation only — the browser never executes them.
2. The real scripts are injected by `script.js` **only after "Accept"**, and **only once
   each** (guarded by an in-memory flag + a DOM id check, so they never double-load).

**To add or swap a tracker:** edit the config objects at the top of `script.js`
(`VISILEAD`, `LEADPIPE`, `WARMLY`) — set `src`, `id`, and `enabled`. Nothing else changes.

### VisiLead consent mode
VisiLead is injected with `data-consent="manual"`, so it stores and tracks **nothing**
until `visilead.consent()` is called — which happens only after Accept. It also honours
the browser's GPC opt-out signal automatically.

### Consent behaviour
- **Accept** → saves `pf_consent=accepted`, injects enabled trackers, calls
  `visilead.consent()`, logs `VisiLead pixel loaded — consent granted`.
- **Reject** → saves `pf_consent=rejected`, loads **nothing**, logs
  `Tracking rejected — no visitor-identification pixel loaded`.
- **Reset consent** (footer) → calls `visilead.revokeConsent()` (stops tracking and
  deletes the visitor ID from the browser), clears the choice, and reloads.

### Custom events
VisiLead documents `consent()` and `revokeConsent()`, but no public custom-event API.
`script.js` therefore **probes** for a `.track()` method on any loaded provider and
otherwise falls back to a `dataLayer` queue, logging exactly what it did. It never
fabricates a successful send. Events only fire when consent is `accepted`.

---

## Run locally

Any static file server works. For example:

```bash
# Python 3
python -m http.server 8080

# or Node
npx serve .
```

Then open <http://localhost:8080>.

> Note: these tools generally will **not** identify localhost traffic — deploy publicly to test properly.

### Debug panel
Append `?debug=true` to any URL, e.g. `http://localhost:8080/?debug=true`.
It shows page URL, consent status, whether the pixel loaded, a live timestamp,
user agent, referrer, and buttons to fire a test page-view event, a test lead event,
and to clear consent + reload.

---

## Deploy publicly

### Netlify
- **Drag & drop:** zip the folder (or drag the folder) into the Netlify "Sites" page.
- **Git:** connect the repo. `netlify.toml` already sets `publish = "."` and no build command.

### Vercel
- Import the repo (or run `npx vercel`). No framework preset needed — it's static.
  `vercel.json` handles clean URLs and the `/privacy` route.

### GitHub Pages
1. Push these files to a repo.
2. Settings → **Pages** → Source: **Deploy from a branch** → `main` / root.
3. Your site appears at `https://<user>.github.io/<repo>/`.
   *(No build step is needed. A `.nojekyll` file is not required since no filenames start with `_`.)*

---

## ✅ Verification checklist (before you rely on results)

Run these in the browser after deploying (open DevTools → Console + Network):

- [ ] No JavaScript errors in the console on load.
- [ ] Site looks correct on **mobile and desktop** (resize / use device toolbar).
- [ ] Cookie banner appears on first visit (incognito).
- [ ] **Before** choosing: Network shows **zero** requests to `visilead.co`.
- [ ] After **Accept**: console shows `VisiLead pixel loaded — consent granted`; Network shows `tracker.js`.
- [ ] After **Reject**: console shows `Tracking rejected …`; **no** request to `visilead.co`.
- [ ] Loads **only once** (reload with consent accepted → still a single `<script id="visilead-pixel">`).
- [ ] **Reset consent** → console shows `VisiLead consent revoked — visitor ID deleted from browser`.
- [ ] `?debug=true` panel shows correct URL, consent, tracker status, timestamp, UA, referrer.
- [ ] Contact form: submitting shows the thank-you message and does not navigate away.
- [ ] All pages load as static files (index + privacy) with no server needed.

---

## 🧪 Live test checklist

Live site: **https://websitetracking-five.vercel.app**

1. **Site is deployed publicly** on Vercel — done.
2. **Domain is registered in VisiLead** (`websitetracking-five.vercel.app`) — done, status *Pending*.
3. **Open the deployed site in an incognito window.**
4. **Click Accept** on the cookie banner — this is what injects VisiLead and calls
   `visilead.consent()`. Because the tracker is consent-gated, it will **not** load for a
   visit where nobody accepts.
5. **Click "Verify"** in VisiLead → Settings. It should flip *Pending → Verified* once it
   has seen that real page-load. If it stays Pending, revisit the site (accepting consent)
   and verify again.
6. **Browse multiple pages / interact with buttons** (Features, Pricing, Book a Demo, submit the form).
7. **Test from a different internet connection** — e.g. mobile data on a phone, or a
   colleague on a different office/corporate network.
8. **Check the VisiLead dashboard** (Companies / Hot Leads) for detected visitors.

### Expect realistic results — not magic
VisiLead (and every tool like it — Leadpipe, Warmly, etc.) **cannot identify every
visitor**. Identification is best-effort and commonly returns **nothing** for:

- **localhost** and preview traffic,
- **VPN / proxy** traffic,
- **personal / home / mobile IP** addresses (most consumer ISPs are not resolvable to a company),
- visitors using **ad/tracker blockers** (the pixel may be blocked entirely),
- **newly deployed domains** that the provider hasn't finished verifying/warming up
  (VisiLead shows this as *Pending* until it sees a real, consented page-load).

The most reliable positive signal comes from someone browsing on a **corporate
network** whose IP maps to an identifiable business. If you see no leads, that is a
normal outcome for the conditions above — not necessarily a bug in this site.

> This project never fabricates identification results. Trust only what the VisiLead
> dashboard actually reports.
