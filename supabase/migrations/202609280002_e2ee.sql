begin;
-- Never silently leave historical plaintext behind or delete the user's data.
do $$ begin
 if exists(select 1 from public.applications) or exists(select 1 from public.resume_versions)
 or exists(select 1 from storage.objects where bucket_id='resumes')
 then raise exception 'Existing plaintext data detected. Stop and migrate/export it before enabling E2EE.'; end if;
end; $$;
revoke all on public.applications,public.resume_versions from authenticated;
drop policy resume_objects_select on storage.objects;
drop policy resume_objects_insert on storage.objects;
drop policy resume_objects_delete_pending on storage.objects;

create table public.encrypted_vaults(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 vault_id uuid not null,
 key_envelope jsonb not null check(jsonb_typeof(key_envelope)='object'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 unique(owner_id,vault_id)
);
create table public.sealed_files(
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 size bigint not null check(size between 30 and 20000029),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(owner_id,vault_id) references public.encrypted_vaults(owner_id,vault_id) on delete restrict
);
alter table public.encrypted_vaults enable row level security;
alter table public.sealed_files enable row level security;
create policy vault_read on public.encrypted_vaults for select to authenticated using((select auth.uid())=owner_id);
create policy vault_create on public.encrypted_vaults for insert to authenticated with check((select auth.uid())=owner_id and revision=0);
create policy vault_update on public.encrypted_vaults for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy sealed_read on public.sealed_files for select to authenticated using((select auth.uid())=owner_id);
create policy sealed_create on public.sealed_files for insert to authenticated with check((select auth.uid())=owner_id and not ready);
create policy sealed_finalize on public.sealed_files for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
grant select,insert,update on public.encrypted_vaults,public.sealed_files to authenticated;
create function public.protect_encrypted_vault() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id<>old.owner_id or new.vault_id<>old.vault_id
 or new.key_envelope->>'vaultId' is distinct from old.key_envelope->>'vaultId'
 then raise exception 'Vault identity is immutable'; end if;
 new.revision=old.revision+1;new.updated_at=clock_timestamp();return new;
end; $$;
create trigger protect_encrypted_vault before update on public.encrypted_vaults for each row execute function public.protect_encrypted_vault();
create function public.protect_sealed_file() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or new.vault_id<>old.vault_id or new.size<>old.size or new.created_at<>old.created_at or(old.ready and not new.ready)
 then raise exception 'Encrypted file is immutable'; end if;
 if new.ready and not exists(select 1 from storage.objects o where o.bucket_id='sealed-resumes' and o.name=new.owner_id::text||'/'||new.id::text||'.bin' and (o.metadata->>'size')::bigint=new.size)
 then raise exception 'Encrypted file not uploaded'; end if;
 return new;
end; $$;
create trigger protect_sealed_file before update on public.sealed_files for each row execute function public.protect_sealed_file();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sealed-resumes','sealed-resumes',false,20000029,array['application/octet-stream']);
create policy sealed_objects_read on storage.objects for select to authenticated using(
 bucket_id='sealed-resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.sealed_files f where f.owner_id=(select auth.uid()) and name=f.owner_id::text||'/'||f.id::text||'.bin')
);
create policy sealed_objects_create on storage.objects for insert to authenticated with check(
 bucket_id='sealed-resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.sealed_files f where f.owner_id=(select auth.uid()) and not f.ready and name=f.owner_id::text||'/'||f.id::text||'.bin')
);
-- No update/delete policy for ciphertext objects. Clients detect byte tampering with GCM.
commit;
