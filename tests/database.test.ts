import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const ra = "20000000-0000-4000-8000-000000000001",
  rb = "20000000-0000-4000-8000-000000000002";
let db: PGlite;
async function as(id: string) {
  await db.exec("reset role;set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role authenticated;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 insert into auth.users values('${a}'),('${b}');
 `);
  await db.exec(
    readFileSync("supabase/migrations/202609280001_initial.sql", "utf8"),
  );
  for (const [owner, id] of [
    [a, ra],
    [b, rb],
  ]) {
    await as(owner);
    await db.query(
      "insert into resume_versions(id,owner_id,original_name,display_name,path,content_type,size) values($1,$2,'same.pdf','same.pdf',$3,'application/pdf',100)",
      [id, owner, owner + "/" + id + "/resume.pdf"],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('resumes',$1)",
      [owner + "/" + id + "/resume.pdf"],
    );
    await db.query("update resume_versions set ready=true where id=$1", [id]);
  }
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential(
  "PostgreSQL policies using Supabase auth/storage schema fixtures",
  () => {
    it("only exposes own resume rows and object paths", async () => {
      await as(a);
      const rows = await db.query("select id from resume_versions");
      expect(rows.rows).toEqual([{ id: ra }]);
      const objects = await db.query("select name from storage.objects");
      expect(objects.rows).toEqual([{ name: a + "/" + ra + "/resume.pdf" }]);
    });
    it("rejects cross-account resume references", async () => {
      await as(a);
      await expect(
        db.query(
          "insert into applications(owner_id,request_id,job_url,platform,applied_on,resume_id) values($1,gen_random_uuid(),'https://example.com','example.com','2026-09-28',$2)",
          [a, rb],
        ),
      ).rejects.toThrow();
    });
    it("keeps immutable resume identity and blocks overwrite/delete", async () => {
      await as(a);
      await expect(
        db.query("update resume_versions set path='different' where id=$1", [
          ra,
        ]),
      ).rejects.toThrow("immutable");
      expect(
        (
          await db.query(
            "update storage.objects set name='overwritten' returning id",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("delete from storage.objects returning id")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("delete from resume_versions returning id")).rows,
      ).toHaveLength(0);
      await db.query(
        "update resume_versions set display_name='Python 版' where id=$1",
        [ra],
      );
      expect(
        (
          await db.query(
            "select original_name,display_name from resume_versions",
          )
        ).rows,
      ).toEqual([{ original_name: "same.pdf", display_name: "Python 版" }]);
    });
    it("deduplicates request ids and prevents another account editing applications", async () => {
      await as(a);
      const request = "30000000-0000-4000-8000-000000000001";
      const statement =
        "insert into applications(owner_id,request_id,job_url,platform,applied_on,resume_id) values($1,$2,'https://example.com','example.com','2026-09-28',$3)";
      await db.query(statement, [a, request, ra]);
      await expect(db.query(statement, [a, request, ra])).rejects.toThrow(
        "unique",
      );
      await as(b);
      expect((await db.query("select * from applications")).rows).toHaveLength(
        0,
      );
      expect(
        (await db.query("update applications set status='offer' returning id"))
          .rows,
      ).toHaveLength(0);
    });
    it("rejects ownership impersonation on insert", async () => {
      await as(a);
      await expect(
        db.query(
          "insert into resume_versions(owner_id,original_name,display_name,path,content_type,size) values($1,'x.pdf','x.pdf','fake','application/pdf',100)",
          [b],
        ),
      ).rejects.toThrow();
    });
  },
);
