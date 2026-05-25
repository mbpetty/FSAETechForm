# Supabase setup

Follow these steps once. After that, all inspectors share the same data with **live sync** and **role-based login**.

## 1. Create a project

1. Log in at [https://supabase.com](https://supabase.com)
2. **New project** → pick a name and database password (save the password)
3. Wait until the project finishes provisioning

## 2. Run the database schema

1. In Supabase, open **SQL Editor** → **New query**
2. Run `sql/01_schema.sql` (new projects)
3. If you already ran an older version of 01, also run `sql/02_inspection_stations_migration.sql`
4. Run `sql/03_auth.sql` for login, roles, and row-level security
5. Run `sql/04_user_delete.sql` so admins can delete users from Manage → Users
6. Run `sql/05_attribution_and_rls.sql` for inspector attribution on results, pending-user lockdown, and competition delete support
7. Ignore warnings about realtime publication if the table is already listed

## 3. Configure email to send a login code (required for shared tablets)

Inspectors use tablets that are **not** logged into email. They read the code on their phone and type it on the tablet.

Supabase sends a **magic link** by default. You must change one email template:

1. Supabase → **Authentication** → **Email Templates** → **Magic Link**
2. **Remove** `{{ .ConfirmationURL }}` from the template
3. **Add** `{{ .Token }}` so the email shows a numeric code (8 digits on current Supabase projects)

Full copy-paste template and screenshots-level steps: **[docs/EMAIL-OTP-SETUP.md](EMAIL-OTP-SETUP.md)**

Also confirm under **Authentication → Providers → Email** that Email sign-in is enabled.

## 4. Confirm Realtime

1. Go to **Database** → **Replication**
2. Ensure `inspection_results` is listed under realtime (the SQL script adds it)

## 5. Add API keys to the app

1. In Supabase: **Project Settings** → **API**
2. Copy:
   - **Project URL**
   - **anon public** key (not the `service_role` key)
3. In this repo, copy the example config:
   ```bash
   cp js/supabase-config.example.js js/supabase-config.js
   ```
4. Edit `js/supabase-config.js` and paste your URL and anon key

`supabase-config.js` is gitignored so your keys stay local.

## 6. Run the app

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
python3 -m http.server 8080
```

| Page | URL |
|------|-----|
| Log in | http://localhost:8080/login.html |
| Sign up | http://localhost:8080/signup.html |
| Inspector | http://localhost:8080/index.html |
| Dashboard | http://localhost:8080/dashboard.html |
| Manage | http://localhost:8080/admin.html |
| Team view | http://localhost:8080/team.html |
| Pending approval | http://localhost:8080/pending.html |

## 7. Bootstrap your first admin

1. Open **signup.html** and create an account (use your real email — Supabase sends the code there)
2. You will land on the **pending approval** screen
3. In Supabase **SQL Editor**, promote yourself (replace the email):

```sql
update public.profiles
set role = 'admin', status = 'approved', approved_at = now()
where email = 'you@example.com';
```

4. Log out and log back in — you now have full access including **Manage → Users**

## 8. First-time data

1. Log in as admin → **Manage**
2. **Inspections** tab → **Upload CSV** (`JuneInspectionList2026/JuneInspectionList2026.csv` or template)
3. **Teams** tab → upload or add teams
4. **Competitions** tab → assign inspections per competition
5. **Users** tab → approve inspector and team member sign-up requests

## 9. User roles

| Role | Access |
|------|--------|
| **Admin** | Inspector, dashboard, manage data, approve users |
| **Inspector** | Inspector + dashboard (pass/fail any team) |
| **Team member** | Read-only view of their team's inspection status |

New users sign up at **signup.html**, then an admin approves them under **Manage → Users**.

## 10. Inspector workflow (multi-user)

1. Each inspector logs in and opens the inspector app
2. Select **competition** and **team** (car)
3. Pass/fail saves to Supabase immediately
4. Other inspectors and the dashboard see updates within seconds

**Important:** Pass/fail only saves when a **team is selected** (not “All teams”).

## Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User name, role, approval status, team assignment |
| `competitions` | Michigan June, etc. |
| `teams` | Car number, team name, competition |
| `inspection_items` | Master checklist |
| `competition_inspections` | Assign items to competitions |
| `inspection_results` | Per-team pass/fail + comments (realtime) |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Supabase is not configured” | Create `js/supabase-config.js` with real keys |
| Failed to fetch | Use `python3 -m http.server`, not double-clicking HTML |
| Realtime not updating | Check Replication includes `inspection_results` |
| Empty checklist | Admin → Upload CSV |
| “new row violates row-level security” | Run `sql/03_auth.sql` and log in as an approved user |
| No email code received | Check spam; see **Authentication → Logs** in Supabase |
| Email has a link instead of a code | Follow **[EMAIL-OTP-SETUP.md](EMAIL-OTP-SETUP.md)** — edit Magic Link template |
| Stuck on pending | Admin must approve you under **Manage → Users**, or run bootstrap SQL for first admin |
