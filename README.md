# PipelineFlow — Leadpipe pixel test site

A small, production-ready **static** website (plain HTML / CSS / JS) whose only
purpose is to test whether the **Leadpipe** visitor-identification pixel works.

It presents a fictional B2B SaaS landing page called **PipelineFlow** and loads
the Leadpipe pixel **only after the visitor accepts analytics cookies**.

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

## How the pixel is loaded (important)

The Leadpipe script is **not** hard-coded as a normal `<script>` tag, because that
would load it before consent. Instead:

1. `index.html` contains a clearly marked, commented reference block:
   ```html
   <!-- LEADPIPE PIXEL START -->
   ...exact script string, for reference only...
   <!-- LEADPIPE PIXEL END -->
   ```
2. The real pixel is injected by `script.js` **only after "Accept"**, and **only once**
   (guarded by an in-memory flag + a DOM id check, so it never double-loads).

**To swap in a new pixel:** edit `LEADPIPE_PIXEL_SRC` at the top of `script.js`.
Do not modify the script string itself — only the URL.

Current pixel:
```
https://leadpipe.aws53.cloud/p/c801e1ba-dfe5-4c5e-b34a-ce2c53bd990b.js
```

### Consent behaviour
- **Accept** → saves `pf_consent=accepted` in `localStorage`, injects the pixel,
  logs `Leadpipe pixel loaded` in the console.
- **Reject** → saves `pf_consent=rejected`, does **not** load the pixel,
  logs `Leadpipe tracking rejected` in the console.
- **Reset consent** (footer button) → clears the choice and reloads so you can retest.

### Custom events
Leadpipe does not publish a documented browser custom-event API at the time of writing.
`script.js` therefore **probes** for common integration shapes (`window.leadpipe.track`,
a push queue, or a `dataLayer` fallback) and logs what it did. It never fabricates a
successful send. Events are only attempted when consent is `accepted`.

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

> Note: Leadpipe generally will **not** identify localhost traffic — deploy publicly to test properly.

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
- [ ] After **Accept**: console shows `Leadpipe pixel loaded`; Network shows the pixel `.js` request.
- [ ] After **Reject**: console shows `Leadpipe tracking rejected`; **no** pixel request in Network.
- [ ] Pixel loads **only once** (reload with consent already accepted → still a single pixel `<script id="leadpipe-pixel">`).
- [ ] `?debug=true` panel shows correct URL, consent, pixel status, timestamp, UA, referrer.
- [ ] Contact form: submitting shows the thank-you message and does not navigate away.
- [ ] All pages load as static files (index + privacy) with no server needed.

---

## 🧪 Live Leadpipe test checklist

1. **Deploy the website publicly** (Netlify / Vercel / GitHub Pages) so it has a real domain.
2. **Add the deployed domain to Leadpipe** if domain approval/verification is required
   (see <https://dashboard.leadpipe.com/dashboard/pixels>).
3. **Open the deployed site in an incognito window.**
4. **Accept** the tracking consent so the pixel loads.
5. **Browse multiple pages / interact with buttons** (Features, Pricing, Book a Demo, submit the form).
6. **Test from a different internet connection** — e.g. mobile data on a phone, or a
   colleague on a different office network.
7. **Check the Leadpipe dashboard** for detected visitors / company or contact info.

### Expect realistic results — not magic
Leadpipe (and tools like it) **cannot identify every visitor**. Identification is
best-effort and commonly returns **nothing** for:

- **localhost** and preview traffic,
- **VPN / proxy** traffic,
- **personal / home / mobile IP** addresses (most consumer ISPs are not resolvable to a company),
- visitors using **ad/tracker blockers** (the pixel may be blocked entirely),
- **newly deployed domains** that Leadpipe hasn't finished verifying/warming up.

The most reliable positive signal comes from someone browsing on a **corporate
network** whose IP maps to an identifiable business. If you see no leads, that is a
normal outcome for the conditions above — not necessarily a bug in this site.

> This project never fabricates identification results. Trust only what the Leadpipe
> dashboard actually reports.
