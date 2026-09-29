-- Tap Card: one-time Supabase setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- BEFORE running: change 'CHANGE-ME' below to the invite code you'll give colleagues.

-- Cards are public (anyone who scans can read them).
create table if not exists public.cards (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  data jsonb not null check (pg_column_size(data) < 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Edit tokens are stored hashed, in a table nobody can read from the browser.
create table if not exists public.card_secrets (
  slug text primary key references public.cards(slug) on delete cascade,
  edit_hash text not null
);

create table if not exists public.app_config (
  key text primary key,
  value text not null
);
insert into public.app_config (key, value) values ('invite_code', 'CHANGE-ME')
on conflict (key) do update set value = excluded.value;

alter table public.cards enable row level security;
alter table public.card_secrets enable row level security;
alter table public.app_config enable row level security;

drop policy if exists "cards are public" on public.cards;
create policy "cards are public" on public.cards for select to anon, authenticated using (true);
-- No insert/update/delete policies: writes only happen through the functions below.

create or replace function public.create_card(p_slug text, p_invite text, p_data jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if p_invite is distinct from (select value from app_config where key = 'invite_code') then
    raise exception 'bad_invite';
  end if;
  if exists (select 1 from cards where slug = p_slug) then
    raise exception 'slug_taken';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into cards (slug, data) values (p_slug, p_data);
  insert into card_secrets (slug, edit_hash)
    values (p_slug, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return v_token;
end $$;

create or replace function public.update_card(p_slug text, p_token text, p_data jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from card_secrets where slug = p_slug
                 and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')) then
    raise exception 'bad_token';
  end if;
  update cards set data = p_data, updated_at = now() where slug = p_slug;
  return true;
end $$;

create or replace function public.delete_card(p_slug text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from card_secrets where slug = p_slug
                 and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')) then
    raise exception 'bad_token';
  end if;
  delete from cards where slug = p_slug;
  return true;
end $$;

-- File storage: photos, CVs and contact cards. 5 MB cap, only these file types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tapcard', 'tapcard', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/vcard'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tapcard uploads" on storage.objects;
create policy "tapcard uploads" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tapcard');
