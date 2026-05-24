# Email login: send a code (not a magic link)

Inspectors log in on **shared tablets** that are not signed into email. They read the code on their phone and type it on the tablet.

Supabase uses the same API for magic links and OTP codes. What gets sent is controlled by your **email template**, not the app code.

The app accepts **6- or 8-digit** codes (your project currently sends **8 digits**).

## Fix in Supabase (required — one time)

1. Open your project at [supabase.com](https://supabase.com)
2. Go to **Authentication** → **Email Templates**
3. Open the **Magic Link** template (this template is used for OTP sign-in too)
4. **Remove** any line containing `{{ .ConfirmationURL }}` or “Click here to log in”
5. **Replace** the body with the template below (must include `{{ .Token }}`)
6. Click **Save**

### Copy-paste template

**Subject:**
```
Your FSAE Tech Inspection login code
```

**Body (HTML):**
```html
<h2>Your login code</h2>

<p>Type this code on the inspection tablet. Do not use a link — enter the digits manually.</p>

<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 24px 0;">{{ .Token }}</p>

<p>This code expires in 1 hour. If you did not request it, you can ignore this email.</p>
```

## Test locally

Start the server:
```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
python3 -m http.server 8080
```

Then open:

- Log in: http://localhost:8080/login.html
- Sign up: http://localhost:8080/signup.html

Send a code, check email for **8 digits**, type all digits on the login page.

## Verify it worked

1. Open http://localhost:8080/login.html
2. Enter your email → **Send code**
3. Check your email — you should see **8 digits**, **not** a “Log in” button/link
4. Type all 8 digits → **Verify & continue**

## Optional settings

**Authentication → Providers → Email**

- **Email OTP Expiration** — default 3600 seconds (1 hour)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Email still has a link | Edit **Magic Link** template; remove `{{ .ConfirmationURL }}` completely |
| Code rejected / invalid | Enter **all 8 digits**; request a fresh code |
| No email at all | Check spam; **Authentication → Logs** in Supabase |

## Why this happens

From [Supabase passwordless docs](https://supabase.com/docs/guides/auth/auth-email-passwordless):

- If the template includes `{{ .ConfirmationURL }}` → **magic link**
- If the template includes `{{ .Token }}` (and no confirmation URL) → **numeric OTP**

The app calls `signInWithOtp` and `verifyOtp` with the full digit string from the email.
