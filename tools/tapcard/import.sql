-- Tap Card add-on: lets "paste your homepage" work for sites that block
-- browsers from reading them (most university pages), and checks the invite
-- code before anyone starts. Paste into Supabase → SQL Editor → Run. Safe to re-run.

create extension if not exists http with schema extensions;

create or replace function public.check_invite(p_invite text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(p_invite = (select value from app_config where key = 'invite_code'), false);
$$;

-- Fetches a public web page for the importer. Invite-only, http(s) only,
-- no private network addresses, 8 s timeout, first 400 kB.
create or replace function public.fetch_page(p_url text, p_invite text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response;
begin
  if not public.check_invite(p_invite) then raise exception 'bad_invite'; end if;
  if p_url !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?(/|$)' then raise exception 'bad_url'; end if;
  if p_url ~* '^https?://(localhost|[0-9.]+|[^/]*\.(local|internal))(:|/|$)' then raise exception 'bad_url'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  r := extensions.http_get(p_url);
  if r.status >= 400 then raise exception 'fetch_failed'; end if;
  return left(r.content, 400000);
end $$;

-- Link names that the site uses for itself.
alter table public.cards drop constraint if exists cards_slug_reserved;
alter table public.cards add constraint cards_slug_reserved check (slug not in ('edit', 'u', 'via', 'new', 'qr'));
