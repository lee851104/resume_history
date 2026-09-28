begin;
-- Only encrypted recovery material is stored here. The wrapping secret lives on the application server.
create table public.vault_email_recovery (
 owner_id uuid primary key,
 vault_id uuid not null,
 email text not null check(length(email) between 3 and 320 and email=lower(email)),
 sealed_key jsonb not null check((jsonb_typeof(sealed_key)='object'
   and sealed_key->>'v'='1'
   and sealed_key->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
   and sealed_key->>'ct' ~ '^[A-Za-z0-9_-]{64}$') is true),
 updated_at timestamptz not null default now(),
 foreign key(owner_id,vault_id) references public.encrypted_vaults(owner_id,vault_id) on delete cascade
);
alter table public.vault_email_recovery enable row level security;
revoke all on public.vault_email_recovery from public,anon,authenticated;
grant select,insert,update on public.vault_email_recovery to authenticated;
create policy recovery_read on public.vault_email_recovery for select to authenticated using((select auth.uid())=owner_id);
create policy recovery_create on public.vault_email_recovery for insert to authenticated with check((select auth.uid())=owner_id);
create policy recovery_update on public.vault_email_recovery for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create function public.protect_email_recovery() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id<>old.owner_id or new.vault_id<>old.vault_id then raise exception 'Recovery identity is immutable'; end if;
 new.updated_at=clock_timestamp();return new;
end; $$;
create trigger protect_email_recovery before update on public.vault_email_recovery for each row execute function public.protect_email_recovery();
commit;
