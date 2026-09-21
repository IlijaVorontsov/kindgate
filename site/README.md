# kindgate.app — the website

A static site. No build step, no framework, no JavaScript. Everything in this
folder is served as-is.

```
site/
  index.html          landing page
  privacy.html        privacy policy (App Store needs a URL for this)
  404.html
  styles.css          all styling; brand tokens at the top
  icon.svg            the gate mark
  favicon.svg         same file, named for the browser
  apple-touch-icon.png
  og.png / og.svg     social preview card (1200×630)
  _headers            security + cache headers (Cloudflare Pages / Netlify)
  robots.txt
  sitemap.xml
```

Preview locally:

```sh
python3 -m http.server -d site 8000   # then open http://localhost:8000
```

---

## Hosting: use Cloudflare Pages

The domain is already at Cloudflare, which makes Pages the obvious choice —
the custom-domain step writes the DNS record itself, there are no nameservers
to move, and TLS is issued automatically. That last part matters: `.app` is on
the HSTS preload list, so a site without a valid certificate is not merely
insecure, it is **unreachable** — browsers refuse the connection instead of
falling back to HTTP.

Free tier: unlimited bandwidth, 500 builds/month, unlimited static requests.

### Option A — connect the Git repo (recommended)

1. In the Cloudflare dashboard go to
   **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick **`IlijaVorontsov/kindgate`** (the public repository, not the old
   private one it was renamed from) and authorise Cloudflare for it.
3. Build settings:
   - Framework preset: **None**
   - Production branch: **`main`**
   - Build command: *(leave empty)*
   - Build output directory: **`site`**
4. Save and deploy. You get a `*.pages.dev` URL in about 20 seconds.
5. **Custom domains → Set up a domain →** `kindgate.app`. Cloudflare adds the
   record for you. Add `www.kindgate.app` too and it will redirect to the apex.

From then on every push to `main` redeploys, and every other branch gets its
own preview URL.

If the project already exists but is connected to another repository or
branch, change it under **the project → Settings → Builds & deployments →
Source** rather than creating a second project; the custom domain stays put.

Pages serves clean URLs: `/privacy.html` is a permanent redirect to
`/privacy`, so links, the canonical tag and the sitemap use `/privacy`.

### Option B — direct upload, no Git

```sh
npx wrangler pages deploy site --project-name=kindgate
```

First run opens a browser to authenticate. Good if you would rather not connect
the repo (the extension source is in the same repository).

### After the first deploy

- **Email for free:** Cloudflare **Email Routing** gives you
  `hello@kindgate.app` forwarded to your real inbox at no cost — the site and
  the privacy policy both reference that address. Dashboard → the domain →
  **Email → Email Routing**, verify the destination address, add the rule.
  It writes the MX and SPF records for you. It does **not** add DMARC; add
  that yourself under **DNS → Records** so the domain can't be spoofed:

  | Type | Name | Content |
  |---|---|---|
  | TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:hello@kindgate.app` |

- **Turn off Email Address Obfuscation** (the domain → **Scrape Shield**).
  With it on, Cloudflare rewrites every `mailto:` link into a
  `/cdn-cgi/l/email-protection` URL and injects a script to decode it — and
  the site's Content-Security-Policy has no `script-src`, so the script is
  blocked and the Contact links stop being mail links. The pages also wrap
  each address in `<!--email_off--> … <!--/email_off-->`, which Cloudflare
  honours, so the links survive even if the setting is left on.
- Leave the orange cloud (proxy) **on**. Caching and TLS come with it.
- Optionally turn on **Always Use HTTPS** and **Automatic HTTPS Rewrites**
  under SSL/TLS → Edge Certificates.

---

## Alternatives, if you'd rather not use Pages

| Host | Free tier | Worth knowing |
|---|---|---|
| **GitHub Pages** | Unlimited for public repos | Works fine, but with the domain on Cloudflare you must set the DNS record to **DNS-only (grey cloud)** while GitHub issues its certificate, or validation fails. 10 builds/hour, 1 GB site limit. Add a `CNAME` file containing `kindgate.app` to the published folder. |
| **Netlify** | 100 GB/month | Reads the same `_headers` file unchanged. Drag-and-drop deploy works without Git. Bandwidth is metered, unlike Pages. |
| **Vercel** | 100 GB/month | Excellent DX, but the free tier is for non-commercial use — if Kindgate is ever paid, that is a licence problem. Ignores `_headers`; needs `vercel.json`. |
| **Cloudflare R2 + Worker** | Overkill here | Only worth it if the site grows large assets. |

GitHub Pages is the closest runner-up and is genuinely fine. The reason to
prefer Pages is purely that the DNS already lives at Cloudflare.

---

## Before launch

- [ ] **App Store link.** Two placeholders in `index.html` read
      `Coming to the App Store` and are marked with an HTML comment. Replace
      both `<span class="btn btn-soon">` elements with
      `<a class="btn" href="…">Get it on the App Store</a>` once the listing exists.
- [ ] **Pricing.** Deliberately not stated anywhere on the site yet. Add a line
      to the privacy band or a small pricing section when it is decided.
- [x] **Contact address.** `hello@kindgate.app` appears in `index.html` and
      `privacy.html`; Email Routing (above) forwards it.
- [ ] **DMARC record** (above). Email Routing does not add it.
- [ ] **Email Address Obfuscation off** (above), or the Contact links break.
- [x] **Source link.** Points at `github.com/IlijaVorontsov/kindgate`, the
      public source repository. The Pages project must deploy from that
      repository too, or the live site keeps the old link.
- [ ] **Self-host the fonts** (optional). Fraunces and Instrument Sans currently
      load from Google Fonts — the only third-party request on the site, and
      it is disclosed in the privacy policy. Dropping two `.woff2` files into
      `site/fonts/` with an `@font-face` block removes that request entirely and
      lets the CSP tighten to `default-src 'none'; style-src 'self'`.
