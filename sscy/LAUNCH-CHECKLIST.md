# SSCY Site Launch Checklist

Running checklist of everything needed to make the new site work live.
Updated as work progresses.

---

## 0. Data Source Migration (hardcoded → live)

**The big picture:** Most site content is hardcoded in `events-data.js` as a
placeholder. As SSCY's third-party accounts come online, each category
migrates to its live API source. When this section is fully checked off,
there will be near-zero hardcoded content in the repo and SSCY staff will
edit everything through the tools they already use (Retreat Guru admin,
Acuity admin, Square dashboard, Google Sheets).

| Data | Current source | Target source | Status |
|---|---|---|---|
| Retreats (upcoming, dated) | `events-data.js` EVENTS (7 program descriptions) + Retreat Guru API | Retreat Guru API only | Partially live |
| Retreat Guru programs | Retreat Guru API | Retreat Guru API | ✓ Live |
| Weekly yoga classes (9) | `events-data.js` CLASSES_DATA + `calendar.html` CLASSES | Acuity Appointment Types API | Hardcoded |
| Wellness treatments (10) | `events-data.js` TREATMENTS_DATA | Acuity Appointment Types API | Hardcoded |
| Community gatherings (4) | `events-data.js` COMMUNITY_DATA | Google Calendar or stay hardcoded (free walk-ins) | Hardcoded |
| Music for Peace concerts | `events-data.js` EVENTS | Retreat Guru or Square Online (tickets) | Hardcoded |
| Blog posts | WordPress REST API (current Flywheel host) | WordPress.com API (blog.saltspringcentre.com) | Live (source changes) |
| Shop products | `shop.html` PRODUCTS array | Square Online storefront | Hardcoded |
| Community calendar overlays | Google Calendar embed | Google Calendar embed | ✓ Live |
| Community dashboard (9 tabs) | Google Sheets via Apps Script | Google Sheets via Apps Script | ✓ Live |

### Migration tasks

**Retreats → Retreat Guru**
- [ ] SSCY adds all year-round programs to Retreat Guru as recurring program templates (Yoga & Wellness Weekends, Breath as Gateway, Ayurveda & Yoga I Want More, Yoga Intensive, Going Deeper Silent, Annual Community Retreat, Personal Retreats)
- [ ] Once they appear in the Retreat Guru API, delete the 7 placeholder retreat entries from `events-data.js`
- [ ] Verify offerings.html and calendar widget still show them (via the live API fetch)
- [ ] Delete the hardcoded retreat cards from offerings.html (the retreat grid will render entirely from the API)

**Classes → Acuity**
- [ ] SSCY creates Acuity account (see section 5)
- [ ] SSCY creates Appointment Types in Acuity for each weekly class under category "Yoga Classes" (with duration, price, teacher notes)
- [ ] Extend `events-data.js` or add a new `acuity-data.js` that fetches from `https://acuityscheduling.com/api/v1/appointment-types` (requires API key — Acuity user ID plus API key, do this server-side via Cloudflare Worker for safety)
- [ ] Replace hardcoded `CLASSES_DATA` with the fetched list
- [ ] Remove duplicated `CLASSES` array from `calendar.html` and `m/calendar.html`, have them read from the same source
- [ ] Test: Kirtan-style day change should only require editing Acuity, not touching code

**Treatments → Acuity**
- [ ] SSCY creates Appointment Types in Acuity for each treatment under category "Wellness"
- [ ] Include pricing tiers (60 min / 90 min / add-on) as separate appointment types or variations
- [ ] Same fetch mechanism replaces `TREATMENTS_DATA`
- [ ] Verify `event.html?id=treatment-*` pages render correctly from fetched data

**Shop → Square Online**
- [ ] SSCY populates Square Online store with all products
- [ ] Set up `shop.saltspringcentre.com` subdomain pointing at Square Online
- [ ] Replace local `shop.html` with a landing page that promotes the store and links out
- [ ] Remove `PRODUCTS` array and cart logic from `shop.html` / `m/shop.html`
- [ ] Concert tickets also live in Square Online (as event products)

**Community gatherings → Google Calendar (code ready, needs deployment)**
- [x] Apps Script written: `sscy/community-events-api.gs`
- [x] events-data.js wired to fetch from Apps Script on page load and replace hardcoded COMMUNITY_DATA (falls back silently if fetch fails)
- [ ] SSCY creates recurring events in the community Google Calendar (`c_t567jg3h1u3hgj7fii50ie8k6k@group.calendar.google.com`):
  - Sunday Satsang — every Sunday, 2:00–3:30 PM, Satsang Room, full description in event details
  - Vancouver Satsang — every Wednesday, 6:30–8:00 PM, online, Zoom link in event details
  - Kirtan Class — every Wednesday, 7:00–8:30 PM (currently paused for summer), Satsang Room
  - Daily Arati — every day, 6:45–7:15 AM, The Temples
- [ ] Deploy `community-events-api.gs` as Apps Script web app:
  - Open script.google.com → New project (or add to existing SSCY project)
  - Paste `community-events-api.gs`
  - Deploy → New deployment → Web app → Execute as: Me, Access: Anyone
  - Copy the deployment URL
- [ ] Replace `COMMUNITY_EVENTS_API_PLACEHOLDER` in `events-data.js` with the Apps Script URL
- [ ] Once deployed and calendar populated, the 4 hardcoded COMMUNITY_DATA entries in events-data.js can be deleted entirely (they're already overridden at runtime, deleting them just reduces the fallback)

**Blog**
- [ ] See section 3 — move to WordPress.com free tier at `blog.saltspringcentre.com`

### Cloudflare Worker #3 — Acuity Proxy (required for Acuity integration)

Acuity's Appointment Types API requires basic auth with an API key. That key can't live in client-side JS. So:

- [ ] Build `workers/acuity-proxy.js` following the same pattern as `retreat-guru-proxy.js`
- [ ] Worker endpoint: `saltspringcentre.com/api/acuity/appointment-types`
- [ ] Inject Acuity `USER_ID` and `API_KEY` from Worker env vars
- [ ] Restrict to GET requests on `appointment-types` endpoint only
- [ ] Cache responses for 5-10 minutes to reduce API calls
- [ ] Update `events-data.js` (or a new helper) to fetch from this proxy instead of hardcoded arrays

---

## 1. Cloudflare Migration

**Blocker: needs SSCY email and GoDaddy access.**

- [ ] Create new Cloudflare account with an SSCY email
- [ ] Add `saltspringcentre.com` as a site in Cloudflare
- [ ] Copy the two new nameservers Cloudflare provides
- [ ] Log into GoDaddy, update nameservers (currently pointed at Jeff's Cloudflare)
- [ ] Recreate DNS records in new Cloudflare account:
  - [ ] MX records for email (Google Workspace - critical, verify before switchover):
    ```
    MX  @  1   aspmx.l.google.com
    MX  @  5   alt1.aspmx.l.google.com
    MX  @  5   alt2.aspmx.l.google.com
    MX  @  10  alt3.aspmx.l.google.com
    MX  @  10  alt4.aspmx.l.google.com
    ```
  - [ ] SPF records (both Google and Sendinblue/Brevo):
    ```
    TXT  @  "v=spf1 include:_spf.google.com ~all"
    TXT  @  "v=spf1 include:spf.sendinblue.com mx ~all"
    TXT  @  "Sendinblue-code:4516c6461275861f21dea0ce807b6f1c"
    ```
  - [ ] DKIM records:
    ```
    TXT  google._domainkey  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAotI+gGpxqhgAnlZcM1FzgGTWD7+nSJOHvqjna3xqauTTcN2wxKY1UuxFa/EU3jlHgOKcIAnvxjnsxjIMzTdH+3tj7suWUmYPIs269Q/M2TyhzNP3O8eRJ8SE+rjwX+f5J4bcIKiyI0D1qQcm+6o935Nmty4Q/SfcHqdUmAxZjzY9Brb7oAZ2HhIjg+pLqSMONSBFPoRKC4sJWQKG0R5HDT537RxGhKksVlr1tCDEJcvIARU0Gno9Yf8aTLozJ6TLCxRDLEECr2rpif23AC+5qr4gELvtjc2OPM3JfyWlvcHFUAfgp83PlvTdnU0Ii4jyaNQTy3DNgcu2VnTepqVjcwIDAQAB"
    TXT  mail._domainkey  "k=rsa;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDeMVIzrCa3T14JsNY0IRv5/2V1/v2itlviLQBwXsa7shBD6TrBkswsFUToPyMRWC9tbR/5ey0nRBH0ZVxp+lsmTxid2Y2z+FApQ6ra2VsXfbJP3HE6wAO0YTVEJt1TmeczhEd2Jiz/fcabIISgXEdSpTYJhb0ct0VJRxcg4c8c7wIDAQAB"
    ```
  - [ ] DMARC record:
    ```
    TXT  _dmarc  "v=DMARC1; p=none; sp=none; rua=mailto:dmarc@mailinblue.com!10m; ruf=mailto:dmarc@mailinblue.com!10m; rf=afrf; pct=100; ri=86400"
    ```
  - [ ] Any existing subdomains (shop., blog., etc. as they get set up)
- [ ] Create a Cloudflare Pages project
  - [ ] Connect to `pietsuess/clients` (or a new SSCY-owned repo)
  - [ ] Build output directory: `sscy/`
  - [ ] Verify site loads on `*.pages.dev` preview URL
- [ ] Add custom domain `saltspringcentre.com` to the Pages project
- [ ] Enable "Always Use HTTPS" in Cloudflare SSL/TLS settings
- [ ] Set SSL mode to "Full (strict)"

---

## 2. Cloudflare Workers

### 2a. Retreat Guru API Proxy (READY TO DEPLOY)
- [ ] Create a Worker in Cloudflare Dashboard
- [ ] Paste code from `sscy/workers/retreat-guru-proxy.js`
- [ ] Add environment variable: `RETREAT_GURU_TOKEN` = `ce54314d68b0417fc9be95a93d202c81`
- [ ] Set up route: `saltspringcentre.com/api/retreat-guru/*`
- [ ] Update three fetch URLs from direct API to `/api/retreat-guru/`:
  - [ ] `sscy/offerings.html` (line ~852)
  - [ ] `sscy/calendar.html` (2 places)
  - [ ] `sscy/event.html` (renderRG function)
  - [ ] `sscy/m/event.html` (renderRG function)
- [ ] Remove token from client-side code (should no longer be visible in page source)

### 2b. Square Web Payments Worker (FUTURE - after launch)
- [ ] Register an application in Square Developer Dashboard
- [ ] Get Application ID and Access Token
- [ ] Create a Worker that:
  - Receives card token from frontend (Square Web Payments SDK)
  - Calls Square Payments API with Access Token
  - Returns success/failure to frontend
- [ ] Store Access Token as Worker environment variable (never client-side)
- [ ] Integrate Square Web Payments SDK in donate.html and shop.html
- [ ] Customers stay on saltspringcentre.com through the entire purchase flow

---

## 3. Blog Migration (WordPress)

**Decision needed: stay on Flywheel, move to WordPress.com, or retire entirely.**

Current state: blog.html fetches from `saltspringcentre.com/wp-json/wp/v2/posts` (Flywheel).

### Recommended: WordPress.com free tier
- [ ] Create a WordPress.com account with SSCY email
- [ ] Export all posts from current Flywheel WP install (Tools → Export)
- [ ] Import to WordPress.com (Tools → Import)
- [ ] Verify all posts, images, and categories transferred
- [ ] Set up subdomain: `blog.saltspringcentre.com` → WordPress.com via CNAME
- [ ] Update blog.html and m/blog.html fetch URL to `blog.saltspringcentre.com/wp-json/wp/v2/posts`
- [ ] Verify blog feed loads on the new site
- [ ] Cancel Flywheel subscription once confirmed

---

## 4. Square Payment Setup

### Done
- [x] Donation link with custom amount: `square.link/u/Oa6tCVaL` (wired into all donate buttons)

### To Do
- [ ] Create a Square payment link for shop checkout
  - Replace `PLACEHOLDER_SHOP` in `shop.html` and `m/shop.html`
- [ ] Create a $40 payment link for Music for Peace concert tickets
  - Update the 4 active concert events in `events-data.js`
- [ ] Optional: separate recurring/monthly donation link
  - Currently the "Monthly Gift" button uses the same custom-amount link
- [ ] Optional: dedicated School Roof donation link
  - Currently uses the main donation link

---

## 5. Acuity Scheduling Setup

**Blocker: needs SSCY Acuity account.**

- [ ] Create an Acuity account at acuityscheduling.com
  - Growing plan, $27/month (supports Square integration)
- [ ] Business Settings → Integrations → Connect Square
  - Authorize Acuity to process payments through SSCY's Square account
- [ ] Create appointment types with these categories:
  - [ ] **Yoga Classes** - all 9 weekly classes (Hatha/Dorothy, Yoga Flow/John, Sacred Sunday, Gentle Hatha Repair, Meditation & Mellow, Mindfulness Nature, Yoga Sutras, Bhagavad Gita, Sadhana)
  - [ ] **Community** - Sunday Satsang, Vancouver Satsang, Kirtan Class, Daily Arati
  - [ ] **Wellness** - all 10 treatments (Swedish Massage, MAHA, Abhyanga, Swedana, Shirodhara, Acupuncture, Bodywork, Fire Cupping, Wood-Fired Sauna, Reset & Rejuvenate)
  - [ ] **Retreats** - local retreats not on Retreat Guru
- [ ] Customize Acuity appearance to match SSCY colors:
  - Button color: `#3bb8a8` (teal)
  - Background: `#faf8f4` (cream)
- [ ] Find the Acuity Owner ID (Share Your Calendar → Embed Code → copy owner number)
- [ ] Find/replace `OWNER_ID` across the entire site with the real value:
  - `sscy/event.html` (4 places in render functions)
  - `sscy/m/event.html` (4 places in render functions)
  - `sscy/calendar.html` (Book a Class iframe)
  - `sscy/wellness.html` (Book a Treatment iframe)

---

## 6. Contact Form

Current state: `contact.html` uses `mailto:info@saltspringcentre.com` only.

- [ ] Decide: Google Forms embed OR Cloudflare Worker + email relay
- [ ] If Worker: set up Cloudflare Turnstile for spam protection
- [ ] If Google Form: create form, embed iframe in contact.html
- [ ] Test submission end-to-end

---

## 7. Content & Credentials from SSCY

These need to come from the Centre before going fully live:

- [ ] **Square account credentials** (for Acuity integration and future Web Payments)
- [ ] **Acuity OWNER_ID** (after account is created)
- [ ] **Shop product list with prices** (to create Square payment links)
- [ ] **Additional images** needed:
  - [ ] `2021/10/centre-garden-path.jpg` (currently substituted)
  - [ ] `2021/10/study-group.jpg` (currently substituted)
  - [ ] `2021/10/temple-ceremony.jpg` (currently substituted)
  - [ ] `2021/10/yoga-class-outdoor-2.jpg` (currently substituted)
  - [ ] `2022/05/centre-grounds.jpg` (currently substituted)
  - [ ] `2022/05/music-satsang-room.jpg` (currently substituted)
  - [ ] `2024/03/yoga-intensive-group.jpg` (currently substituted)
  - [ ] `2025/01/yssi-group.jpg` (currently substituted)
  These were 404s on WP — need real photos from SSCY or keep substitutes
- [ ] **Google Sheet access** for community dashboard (already working, verify perms persist)

---

## 8. Pre-Launch Testing

Before switching DNS, run through:

- [ ] Every page loads without console errors (desktop + mobile)
- [ ] Every navigation link works
- [ ] Every donation button opens Square payment link
- [ ] Every class/treatment "Book" button opens Acuity
- [ ] Retreat Guru programs load on offerings.html and calendar.html
- [ ] Individual event detail pages render correctly:
  - [ ] Retreats (event.html?id=spring-cleanse, etc.)
  - [ ] Classes (event.html?id=class-hatha-dorothy, etc.)
  - [ ] Community (event.html?id=community-sunday-satsang, etc.)
  - [ ] Treatments (event.html?id=treatment-abhyanga, etc.)
  - [ ] Retreat Guru programs (event.html?rg=20, etc.)
- [ ] Calendar month/week/day views all show events
- [ ] Blog feed loads
- [ ] Contact form submits successfully
- [ ] Images all load (no broken images)
- [ ] SSL padlock shows on every page
- [ ] Mobile site redirects correctly from desktop URLs on phones

---

## 9. DNS Cutover (THE big moment)

Only when everything above is green:

- [ ] Final backup of current WordPress site and database
- [ ] At GoDaddy: update nameservers to the new Cloudflare ones
- [ ] Watch DNS propagation (can take 0-48 hours)
- [ ] Once propagated, verify:
  - [ ] saltspringcentre.com loads the new site
  - [ ] Email still works (send/receive test)
  - [ ] blog.saltspringcentre.com loads (if migrated)
- [ ] Cancel old WordPress/Flywheel hosting
- [ ] Celebrate

---

## 10. Post-Launch

- [ ] Set up Google Analytics or Plausible
- [ ] Submit sitemap to Google Search Console
- [ ] Add Schema.org structured data to event pages for rich search results
- [ ] Set up uptime monitoring (UptimeRobot free tier)
- [ ] Document the admin workflow for SSCY staff in `admin-guide.html`
- [ ] Eventually: build Square Web Payments SDK integration (Worker #2) so checkout stays on-site

---

## Current Blockers

1. **SSCY needs to create a Cloudflare account** (can use any SSCY email)
2. **SSCY needs to create an Acuity account** and provide OWNER_ID
3. **GoDaddy access** for nameserver cutover (when ready)
4. **Jeff at Local Propeller** — DNS records to export from his Cloudflare (optional if we just recreate from scratch)

---

*Last updated: 2026-04-10*
