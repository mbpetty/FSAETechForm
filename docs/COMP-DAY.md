# Comp-day cheat sheet — FSAE Tech Inspection

Print or bookmark this page for inspection day. Replace `YOUR-APP.vercel.app` with your Vercel URL.

---

## URLs (production)

| Who | Link |
|-----|------|
| **Log in** (tablets) | https://YOUR-APP.vercel.app/login.html |
| **Inspector** | https://YOUR-APP.vercel.app/index.html |
| **Organizer dashboard** | https://YOUR-APP.vercel.app/dashboard.html |
| **Admin / manage** | https://YOUR-APP.vercel.app/admin.html |
| **Team read-only** | https://YOUR-APP.vercel.app/team.html |
| **Sign up** (new users) | https://YOUR-APP.vercel.app/signup.html |

Local testing: swap `YOUR-APP.vercel.app` → `localhost:8080` (same paths).

---

## Before cars arrive (admin)

1. Log in as **admin** → https://YOUR-APP.vercel.app/admin.html  
2. **Inspections** — checklist uploaded for the competition  
3. **Teams** — all cars loaded  
4. **Competitions** — inspections assigned to the correct comp (e.g. June EV)  
5. **Users** — approve all inspectors; approve team members with correct team  
6. Open **dashboard** — confirm teams appear  

---

## Inspector workflow (tablet)

1. Open **login** → enter email → type **8-digit code** from phone (not the email link)  
2. Select **competition** → **team** (car #)  
3. Filter by **station** if needed  
4. **Pass** / **Fail** each item (tap again to clear)  
5. Add **comment** after pass/fail; tap **Save**  
6. “**Live sync on**” = other inspectors see updates for this team  

**Important:** Pass/fail only saves when a **specific team** is selected (not “All teams”).

---

## Organizer workflow

1. **Dashboard** — all teams, progress bars, failures  
2. Filter by competition / status  
3. **Show failures** on a team card for details  
4. **Inspect** — jump to that team in the inspector view  
5. **Export PDF** — from dashboard or inspector when a team is selected  

---

## Team member workflow

1. Sign up → wait for **admin approval**  
2. After approval, log in → **My team** (read-only status + comments)  
3. Cannot change pass/fail until approved; pending users see only the approval screen  

---

## Approving new users (admin)

1. **Manage → Users** tab  
2. **Pending** — Approve as Inspector / Team member / Admin  
3. Team members: **must pick a team** before Approve  
4. **Delete** — remove test accounts or mistakes  

**Testing with one Gmail:** `you+inspector@gmail.com`, `you+team@gmail.com` (same inbox).

---

## Multi-inspector test (do this before comp)

1. Two tablets, same team selected  
2. Tablet A: pass item #1  
3. Tablet B: should show pass within ~5 seconds  
4. Dashboard should update progress  

---

## If something breaks

| Problem | Fix |
|---------|-----|
| Can't log in | New 8-digit code; check spam |
| "Awaiting approval" | Admin → Users → Approve |
| Pending user sees data | Run `sql/05_attribution_and_rls.sql` in Supabase |
| Empty inspection list | Admin → Competitions → assign inspections |
| Can't delete competition | Remove or reassign teams in that competition first |
| No live sync | Select a team; check venue internet |
| PDF blank | Select a team first, then Export PDF |

---

## SQL migrations (run once in Supabase SQL Editor, in order)

1. `sql/01_schema.sql`  
2. `sql/02_inspection_stations_migration.sql` (if upgrading old DB)  
3. `sql/03_auth.sql`  
4. `sql/04_user_delete.sql`  
5. `sql/05_attribution_and_rls.sql`  

---

## Roles quick reference

| Role | Can do |
|------|--------|
| **Admin** | Everything + approve users |
| **Inspector** | Pass/fail any team, dashboard |
| **Team member** | Read-only own team status |
