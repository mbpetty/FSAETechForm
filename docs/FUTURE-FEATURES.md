# Future features (not scheduled)

| Feature | Status |
|---------|--------|
| **Email on signup + approve/reject links** | Implemented — see [EMAIL-APPROVAL-SETUP.md](EMAIL-APPROVAL-SETUP.md) |
| **Approve users via email reply** | Deferred — link-based approval shipped instead |
| **Rich-text inspector responses** | Not started |
| **Type-to-filter team dropdown** | Not started — type car # to jump to team (~100 teams) |
| **External inspection status API** | Not started — read-only API or embed for partner sites (with permission) to show team inspection status on their own dashboards |
| **In-app user feedback collection** | Implemented — Feedback button + modal for all logged-in users; Admin → Feedback tab to review submissions (requires `feedback` table) |
| **QR code → team inspection** | Potential next-year item |

---

## Feedback table (required for the new feedback system)

Run this in Supabase SQL Editor:

```sql
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id),
  user_name text,
  user_email text,
  category text check (category in ('bug','feature','other')),
  message text not null,
  metadata jsonb
);

alter table public.feedback enable row level security;

create policy "feedback insert authenticated"
  on public.feedback for insert to authenticated with check (true);

create policy "feedback admin read"
  on public.feedback for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
```

Last updated: June 2026
