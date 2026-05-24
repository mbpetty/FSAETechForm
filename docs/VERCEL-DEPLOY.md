# Deploy to Vercel (hosted demo)

Use this for on-site demos with multiple inspectors on tablets. The app is static HTML/JS; Supabase stays your backend.

## Before you deploy

1. Run all SQL migrations in Supabase (`sql/01_schema.sql` through `sql/04_user_delete.sql`)
2. Have your **Project URL** and **anon key** from Supabase → **Project Settings** → **API**
3. Bootstrap at least one **admin** account (see [SUPABASE-SETUP.md](SUPABASE-SETUP.md))
4. Load inspections, teams, and competition assignments in **Manage**

## Option A — Vercel dashboard (recommended)

### 1. Push code to GitHub

**Detailed step-by-step:** [GITHUB-PUSH.md](GITHUB-PUSH.md)

Short version — create an **empty** repo on GitHub first, then:

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
git init
git add .
git commit -m "Prepare FSAE tech inspection app for Vercel deploy"
```

Create a repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/FSAETechFormC.git
git branch -M main
git push -u origin main
```

### 2. Import into Vercel

1. Log in at [vercel.com](https://vercel.com)
2. **Add New…** → **Project**
3. Import your GitHub repository
4. Vercel should detect the settings from `vercel.json` and `package.json`:
   - **Framework Preset:** Other
   - **Build Command:** `npm run build`
   - **Output Directory:** leave default (project root)

### 3. Add environment variables

In Vercel → your project → **Settings** → **Environment Variables**, add:

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon public key |

Enable for **Production**, **Preview**, and **Development**.

Redeploy after adding variables (**Deployments** → ⋮ → **Redeploy**).

### 4. Configure Supabase Auth for your Vercel URL

After the first deploy, copy your production URL (e.g. `https://fsae-tech-form.vercel.app`).

In Supabase → **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://YOUR-APP.vercel.app` |
| **Redirect URLs** | `https://YOUR-APP.vercel.app/**` |

Save. (Needed for auth flows; OTP login uses your email template + code entry on the site.)

### 5. Test production

Replace `YOUR-APP` with your Vercel subdomain:

| Page | URL |
|------|-----|
| Log in | https://YOUR-APP.vercel.app/login.html |
| Sign up | https://YOUR-APP.vercel.app/signup.html |
| Inspector | https://YOUR-APP.vercel.app/index.html |
| Dashboard | https://YOUR-APP.vercel.app/dashboard.html |
| Manage | https://YOUR-APP.vercel.app/admin.html |
| Team view | https://YOUR-APP.vercel.app/team.html |

From a phone on cellular (not Wi‑Fi): open the login URL, send code, verify, pass/fail a test item.

---

## Option B — Vercel CLI

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
npx vercel login
npx vercel link
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_ANON_KEY
npx vercel --prod
```

Then complete **Supabase URL Configuration** (step 4 above) using the URL Vercel prints.

---

## How the build works

`npm run build` runs `scripts/generate-supabase-config.js`, which writes `js/supabase-config.js` from environment variables. That file is gitignored locally but generated on every Vercel deploy so keys are not committed to git.

Local development is unchanged: keep using `js/supabase-config.js` on your machine (copy from `supabase-config.example.js`).

---

## Comp-day checklist

- [ ] Production URL works on a phone (login + inspector)
- [ ] Admin can approve new inspectors at **Manage → Users**
- [ ] June EV (or your comp) has inspections + teams loaded
- [ ] 2–3 tablets logged in as inspectors on the **same team** — confirm live sync
- [ ] Organizer dashboard shows progress: `/dashboard.html`
- [ ] Share login URL with inspectors (bookmark on tablets)
- [ ] Optional: custom Vercel domain or memorable project name

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails: missing env vars | Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel, redeploy |
| No Output Directory named "public" | Fixed in repo — `vercel.json` sets `outputDirectory: "public"`; pull latest and redeploy |
| “Supabase is not configured” on live site | Redeploy after env vars; check build logs for “Wrote … supabase-config.js” |
| Login works locally but not on Vercel | Set Supabase **Site URL** to your Vercel URL |
| RLS / permission errors | User must be **approved** in Manage → Users |
| Slow on venue Wi‑Fi | Vercel + Supabase are cloud-hosted; venue only needs internet, not your laptop |

---

## Custom domain (optional)

Vercel → **Settings** → **Domains** → add e.g. `tech.yourteam.edu`. Update Supabase **Site URL** and **Redirect URLs** to match.
