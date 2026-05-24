# FSAE Tech Form (Digital)

Web application for FSAE Michigan June technical inspection — shared data via **Supabase** with **real-time sync** between inspectors.

## Setup (first time)

See **[docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md)** for:

1. Supabase project + run `sql/01_schema.sql`
2. Copy `js/supabase-config.example.js` → `js/supabase-config.js` and add your API keys
3. Run a local server and load checklist / teams in admin

## Run locally

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
python3 -m http.server 8080
```

| Page | URL |
|------|-----|
| Log in | http://localhost:8080/login.html |
| Sign up | http://localhost:8080/signup.html |
| Inspector | http://localhost:8080/index.html |
| Organizer dashboard | http://localhost:8080/dashboard.html |
| Manage data | http://localhost:8080/admin.html |
| Team view | http://localhost:8080/team.html |
| Pending approval | http://localhost:8080/pending.html |

## Deploy (Vercel)

For on-site demos with multiple inspectors, deploy to Vercel:

**[docs/VERCEL-DEPLOY.md](docs/VERCEL-DEPLOY.md)** — GitHub import, env vars, Supabase auth URLs, comp-day checklist.

## Features

- **Inspector app** — filters, pass/fail, comments, collapsible descriptions
- **Shared database** — all inspectors see the same results per team
- **Realtime** — changes sync live when viewing a selected team
- **Admin** — manage inspections (title, description, competition, station) and teams (car #, name, competition)
- **CSV import** — seed checklist from `JuneInspectionList2026/JuneInspectionList2026.csv`

## Project layout

```
FSAETechFormC/
├── sql/01_schema.sql           # Run in Supabase SQL editor
├── JuneInspectionList2026/
├── docs/SUPABASE-SETUP.md
├── index.html                  # Inspector
├── admin.html                  # Manage inspections & teams
└── js/
    ├── supabase-config.js      # Your keys (not in git)
    ├── supabase-client.js
    ├── data-store.js
    ├── form.js
    └── admin.js
```

## Roadmap

| Done | Item |
|------|------|
| ✓ | Inspector UI, admin CRUD, Supabase + realtime results |
| ✓ | Organizer dashboard — all teams, progress, failures |
| ✓ | Email OTP login, roles, admin user approval (Users tab) |
| Next | Deploy to Vercel — [GITHUB-PUSH.md](docs/GITHUB-PUSH.md) then [VERCEL-DEPLOY.md](docs/VERCEL-DEPLOY.md) |
| Later | PDF export |
