# Push this project to GitHub

Use this before connecting Vercel. These steps assume you have **never** used git with this folder before.

Your Supabase keys in `js/supabase-config.js` are **gitignored** — they will **not** be uploaded to GitHub. Vercel gets keys from environment variables instead.

---

## What you need

1. A **GitHub account** — sign up at [github.com](https://github.com) if needed
2. **Git** on your Mac — check in Terminal:

```bash
git --version
```

If that fails, install Xcode Command Line Tools:

```bash
xcode-select --install
```

---

## Part 1 — Create an empty repo on GitHub

Do this in the browser first (before running git commands on your Mac).

1. Log in to [github.com](https://github.com)
2. Click the **+** (top right) → **New repository**
3. Fill in:
   - **Repository name:** e.g. `FSAETechFormC` (no spaces)
   - **Description:** optional, e.g. `FSAE tech inspection app`
   - **Public** or **Private** — either works with Vercel
4. **Important:** leave these **unchecked**:
   - ❌ Add a README file  
   - ❌ Add .gitignore  
   - ❌ Choose a license  

   (An empty repo avoids merge conflicts on first push.)

5. Click **Create repository**
6. GitHub shows a page titled “…or push an existing repository from the command line” — **keep this tab open**. You need the URL that looks like:

   `https://github.com/YOUR_USERNAME/FSAETechFormC.git`

   Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Part 2 — Open Terminal in your project folder

In Cursor you can open the integrated terminal, or use the Mac **Terminal** app.

Go to the project:

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
```

Confirm you see the project files:

```bash
ls
```

You should see `index.html`, `admin.html`, `js/`, `docs/`, etc.

---

## Part 3 — Initialize git and make the first commit

Run these commands **one block at a time**.

### 3a. Start git in this folder

```bash
git init
```

Expected output: `Initialized empty Git repository in ...`

### 3b. Tell git your name and email (first time only)

Skip if you’ve done this before on this Mac.

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Use the same email as your GitHub account if possible.

### 3c. Stage all files

```bash
git add .
```

This prepares every file for commit **except** ignored files (like `js/supabase-config.js`).

Verify secrets are not staged:

```bash
git status
```

You should **not** see `js/supabase-config.js` under “Changes to be committed”. If you do, stop and ask for help before pushing.

### 3d. Create the first commit

```bash
git commit -m "Initial commit — FSAE tech inspection app"
```

Expected: a summary like `XX files changed...`

---

## Part 4 — Connect GitHub and push

Replace `YOUR_USERNAME` and `FSAETechFormC` with your repo name if different.

### 4a. Rename the default branch to `main`

```bash
git branch -M main
```

### 4b. Add GitHub as the remote

```bash
git remote add origin https://github.com/YOUR_USERNAME/FSAETechFormC.git
```

### 4c. Push to GitHub

```bash
git push -u origin main
```

**First push:** GitHub may ask you to sign in.

- **Browser login:** a window opens → authorize GitHub  
- **Username/password:** GitHub no longer accepts account passwords for git — use a **Personal Access Token** (see troubleshooting below) or sign in via browser when prompted  

Expected success:

```
Enumerating objects: ...
To https://github.com/YOUR_USERNAME/FSAETechFormC.git
 * [new branch]      main -> main
```

### 4d. Confirm on GitHub

Refresh your repo page in the browser. You should see all project files (`index.html`, `js/`, `docs/`, etc.).

---

## Part 5 — Connect Vercel

Now follow **[VERCEL-DEPLOY.md](VERCEL-DEPLOY.md)**:

1. Vercel → **Add New → Project**
2. **Import** the GitHub repo you just pushed
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables
4. Deploy

---

## After the first push — making updates

When you change code later:

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
git add .
git commit -m "Describe what you changed"
git push
```

Vercel can auto-redeploy on every push if you enable that in project settings.

---

## Troubleshooting

### “Authentication failed” or “Password authentication is not supported”

GitHub requires a **Personal Access Token** instead of your account password for HTTPS:

1. GitHub → profile photo → **Settings**
2. **Developer settings** (bottom left) → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token (classic)**
4. Note: e.g. `FSAETechFormC Mac`
5. Expiration: 90 days or your choice
6. Scopes: check **`repo`**
7. Generate and **copy the token** (you only see it once)
8. When `git push` asks for password, **paste the token** (not your GitHub password)

Or use **GitHub CLI** (easier long-term):

```bash
brew install gh
gh auth login
```

Then push again.

### “remote origin already exists”

```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/FSAETechFormC.git
git push -u origin main
```

### “Updates were rejected” / “failed to push some refs”

You created the GitHub repo **with** a README. Either:

- Delete the repo on GitHub and create a new **empty** one, or  
- Pull first (advanced):

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### “git: command not found”

Install Command Line Tools:

```bash
xcode-select --install
```

### Accidentally committed `supabase-config.js`

It should be gitignored. If it was committed:

```bash
git rm --cached js/supabase-config.js
git commit -m "Stop tracking supabase-config.js"
git push
```

Then rotate your anon key in Supabase if the repo was ever public.

---

## Alternative: GitHub Desktop (no Terminal)

1. Download [GitHub Desktop](https://desktop.github.com/)
2. **File → Add Local Repository** → choose `/Users/mpetty/Documents/CodeProject/FSAETechFormC`
3. If it says “not a git repository”, click **create a repository**
4. Summary: `Initial commit` → **Commit to main**
5. **Publish repository** → choose name → **Publish**
6. Use that repo in Vercel

---

## Quick reference (copy-paste template)

Replace `YOUR_USERNAME` once, then run in order:

```bash
cd /Users/mpetty/Documents/CodeProject/FSAETechFormC
git init
git add .
git status
git commit -m "Initial commit — FSAE tech inspection app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/FSAETechFormC.git
git push -u origin main
```

Next: [VERCEL-DEPLOY.md](VERCEL-DEPLOY.md)
