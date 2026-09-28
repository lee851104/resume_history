-- Run once in the Supabase SQL Editor. No service-role key is used by the app.
begin;
create table public.resume_versions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 original_name text not null check (length(original_name) between 1 and 200),
 display_name text not null check (length(display_name) between 1 and 200),
 path text not null unique,
 content_type text not null check(content_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size bigint not null check (size between 1 and 20000000),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 unique(owner_id,id),
 check(path like owner_id::text || '/' || id::text || '/resume.%')
);
create table public.applications (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 job_url text not null check(length(job_url)<=4096 and job_url ~ '^https?://'),
 company text check(length(company)<=200), title text check(length(title)<=300),
 platform text not null,
 applied_on date not null,
 status text not null default 'applied' check(status in ('applied','interviewing','offer','rejected','withdrawn')),
 resume_id uuid not null,
 notes text check(length(notes)<=5000), follow_up_on date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,request_id),
 foreign key(owner_id,resume_id) references public.resume_versions(owner_id,id) on delete restrict
);
create index applications_owner_date_idx on public.applications(owner_id,applied_on desc);
create index resumes_owner_created_idx on public.resume_versions(owner_id,created_at desc);
alter table public.resume_versions enable row level security;
alter table public.applications enable row level security;
create policy resumes_select on public.resume_versions for select to authenticated using((select auth.uid())=owner_id);
create policy resumes_insert on public.resume_versions for insert to authenticated with check((select auth.uid())=owner_id and ready=false);
create policy resumes_update on public.resume_versions for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy resumes_delete_pending on public.resume_versions for delete to authenticated using((select auth.uid())=owner_id and ready=false);
create policy applications_select on public.applications for select to authenticated using((select auth.uid())=owner_id);
create policy applications_insert on public.applications for insert to authenticated with check((select auth.uid())=owner_id);
create policy applications_update on public.applications for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
-- No destructive application delete flow in the initial product.
create function public.protect_resume_version() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or new.path<>old.path or new.original_name<>old.original_name or new.content_type<>old.content_type or new.size<>old.size or new.created_at<>old.created_at or (old.ready and not new.ready)
 then raise exception 'Resume versions are immutable'; end if;
 return new;
end; $$;
create trigger protect_resume_version before update on public.resume_versions for each row execute function public.protect_resume_version();
create function public.check_application() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.id<>old.id or new.owner_id<>old.owner_id or new.request_id<>old.request_id or new.created_at<>old.created_at) then raise exception 'Record identity is immutable'; end if;
 if not exists(select 1 from public.resume_versions r where r.id=new.resume_id and r.owner_id=new.owner_id and r.ready) then raise exception 'Ready resume required'; end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
create trigger check_application before insert or update on public.applications for each row execute function public.check_application();
grant select,insert,update,delete on public.resume_versions to authenticated;
grant select,insert,update on public.applications to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('resumes','resumes',false,20000000,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream']);
create policy resume_objects_select on storage.objects for select to authenticated using(
 bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.resume_versions r where r.path=name and r.owner_id=(select auth.uid()))
);
create policy resume_objects_insert on storage.objects for insert to authenticated with check(
 bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.resume_versions r where r.path=name and r.owner_id=(select auth.uid()) and not r.ready)
);
-- Deliberately no UPDATE policy: even a signed upload cannot overwrite a version.
create policy resume_objects_delete_pending on storage.objects for delete to authenticated using(
 bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.resume_versions r where r.path=name and r.owner_id=(select auth.uid()) and not r.ready)
);
commit;
