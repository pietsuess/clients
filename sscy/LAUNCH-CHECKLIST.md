# SSCY Site Launch Checklist

Running checklist of everything needed to make the new site work live.
Updated as work progresses.

---

## 1. Cloudflare Migration

**Blocker: needs SSCY email and GoDaddy access.**

- [ ] Create new Cloudflare account with an SSCY email
- [ ] Add `saltspringcentre.com` as a site in Cloudflare
- [ ] Copy the two new nameservers Cloudflare provides
- [ ] Log into GoDaddy, update nameservers (currently pointed at Jeff's Cloudflare)
- [ ] Recreate DNS records in new Cloudflare account:
  - [ ] MX records for email (critical - verify before switchover)
  - [ ] Any existing subdomains
  - [ ] SPF / DKIM / DMARC TXT records
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
