# Email signup approval (Resend + Supabase Edge Functions)

When someone signs up and lands on **pending**, you receive an email at **mbpetty@gmail.com** with one-click **Approve as inspector**, **Approve as team member**, or **Reject** links.

---

## Overview

| Piece | Purpose |
|-------|---------|
| `sql/08_approval_email_tokens.sql` | One-time approval tokens + processing |
| `notify-admin-signup` Edge Function | Sends Resend email when a pending profile is created |
| `process-approval-link` Edge Function | Validates token and approves/rejects user |
| `approve.html` | Branded page opened from email links |
| Database Webhook | Calls `notify-admin-signup` on `profiles` INSERT |

---

## Step 1 — Run SQL

In **Supabase → SQL Editor**, run:

```
sql/08_approval_email_tokens.sql
```

---

## Step 2 — Resend

1. Sign up at [resend.com](https://resend.com)
2. Add domain **`fsaetechform.com`** and complete DNS (SPF/DKIM records Resend provides)
3. Create an **API key**
4. Until DNS is verified, you can test with `onboarding@resend.dev` as the from address (Resend test mode only sends to your own verified email)

Recommended production from address:

```
FSAETechForm <noreply@fsaetechform.com>
```

---

## Step 3 — Install Supabase CLI & link project

```bash
npm install -g supabase
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

(`YOUR_PROJECT_REF` is the subdomain in your Supabase URL, e.g. `dlysmnjrvhhdunblkzxr`.)

---

## Step 4 — Set Edge Function secrets

In **Supabase Dashboard → Edge Functions → Secrets**, add:

| Secret | Value |
|--------|--------|
| `RESEND_API_KEY` | Your Resend API key |
| `ADMIN_EMAIL` | `mbpetty@gmail.com` |
| `SITE_URL` | `https://fsaetechform.com` |
| `RESEND_FROM_EMAIL` | `FSAETechForm <noreply@fsaetechform.com>` (or `onboarding@resend.dev` for testing) |
| `APPROVAL_WEBHOOK_SECRET` | Long random string you generate (optional but recommended) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to Edge Functions.

Or via CLI:

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set ADMIN_EMAIL=mbpetty@gmail.com
supabase secrets set SITE_URL=https://fsaetechform.com
supabase secrets set RESEND_FROM_EMAIL="FSAETechForm <noreply@fsaetechform.com>"
supabase secrets set APPROVAL_WEBHOOK_SECRET=your-long-random-secret
```

---

## Step 5 — Deploy Edge Functions

```bash
supabase functions deploy notify-admin-signup
supabase functions deploy process-approval-link
```

Note the function URL for `notify-admin-signup`, e.g.:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-admin-signup
```

---

## Step 6 — Database Webhook

1. **Supabase Dashboard → Database → Webhooks → Create a new hook**
2. **Events:** Insert
3. **Table:** `public.profiles`
4. **HTTP Request:**
   - **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-admin-signup`
   - **Method:** POST
   - **Headers:**
     - `Content-Type: application/json`
     - `x-webhook-secret: YOUR_APPROVAL_WEBHOOK_SECRET` (same as Step 4)
5. Save

The function ignores non-pending rows, so auto-approved invites are not emailed.

---

## Step 7 — Deploy site & test

1. Push to GitHub / wait for Vercel deploy (includes `approve.html`)
2. Sign up with a test address (`you+test@gmail.com`)
3. Check **mbpetty@gmail.com** for the approval email
4. Click **Approve as inspector** → should open `https://fsaetechform.com/approve.html?token=...`
5. Test user can log in; **Admin → Activity log** shows the approval

---

## Email actions

| Button | Effect |
|--------|--------|
| **Approve as inspector** | `status=approved`, `role=inspector` |
| **Approve as team member** | Uses their requested team from signup; fails with a message if no team was selected |
| **Reject** | `status=rejected` |

Links expire in **72 hours** and are **one-time use**.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No email received | Check Resend dashboard → Logs; verify `RESEND_API_KEY` and domain |
| Resend test mode | Use `onboarding@resend.dev` as from; only delivers to verified emails |
| Webhook not firing | Database → Webhooks → check delivery logs |
| 401 on webhook | Match `x-webhook-secret` header to `APPROVAL_WEBHOOK_SECRET` |
| Link says expired | Re-approve in Admin → Users; new signup generates new links |
| Team member approve fails | User did not pick a team at signup — approve in Admin and assign team |

---

## Security notes

- Tokens are random 64+ char hex strings stored server-side
- Edge Functions use **service role** only on the server — never put service role key in the static site
- `approve.html` uses the public anon key to call `process-approval-link`; the token is the real secret
- Optional: rotate `APPROVAL_WEBHOOK_SECRET` if webhook URL is ever exposed
