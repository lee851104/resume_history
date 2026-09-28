import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const vid = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
async function as(id: string) {
  await db.exec("reset role;set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role authenticated;create role anon;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 insert into auth.users values('${a}'),('${b}');`);
  await db.exec(
    readFileSync("supabase/migrations/202609280001_initial.sql", "utf8"),
  );
  await db.exec(
    "insert into storage.objects(bucket_id,name,metadata) values('resumes','historical-plaintext','{}')",
  );
  await expect(
    db.exec(readFileSync("supabase/migrations/202609280002_e2ee.sql", "utf8")),
  ).rejects.toThrow("Existing plaintext data");
  await db.exec(
    "rollback;delete from storage.objects where name='historical-plaintext'",
  );
  await db.exec(
    readFileSync("supabase/migrations/202609280002_e2ee.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202609280003_email_recovery.sql", "utf8"),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("encrypted database", () => {
  it("revokes access to the old plaintext tables", async () => {
    await as(a);
    await expect(db.query("select * from applications")).rejects.toThrow(
      "permission denied",
    );
    await expect(db.query("select * from resume_versions")).rejects.toThrow(
      "permission denied",
    );
  });
  it("creates a vault and isolates it by owner", async () => {
    await as(a);
    await db.query(
      "insert into encrypted_vaults(owner_id,vault_id,key_envelope,payload) values($1,$2,$3,$4)",
      [
        a,
        vid,
        JSON.stringify({ vaultId: vid }),
        JSON.stringify({ ct: "encrypted" }),
      ],
    );
    await as(b);
    expect(
      (await db.query("select * from encrypted_vaults")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update encrypted_vaults set payload='{}' returning owner_id",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("uses revision comparison to reject stale updates", async () => {
    await as(a);
    expect(
      (
        await db.query(
          "update encrypted_vaults set payload='{}' where revision=0 returning revision",
        )
      ).rows,
    ).toEqual([{ revision: 1 }]);
    expect(
      (
        await db.query(
          "update encrypted_vaults set payload='{}' where revision=0 returning revision",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects switching the vault key identity", async () => {
    await as(a);
    await expect(
      db.query(
        'update encrypted_vaults set key_envelope=\'{"vaultId":"different"}\'',
      ),
    ).rejects.toThrow("immutable");
  });
  it("keeps encrypted objects private and immutable", async () => {
    await as(a);
    const fid = "30000000-0000-4000-8000-000000000001";
    const path = a + "/" + fid + ".bin";
    await db.query(
      "insert into sealed_files(id,owner_id,vault_id,size) values($1,$2,$3,50)",
      [fid, a, vid],
    );
    await expect(
      db.query("update sealed_files set ready=true"),
    ).rejects.toThrow("not uploaded");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('sealed-resumes',$1,'{\"size\":50}')",
      [path],
    );
    await db.query("update sealed_files set ready=true");
    expect(
      (await db.query("update storage.objects set name='changed' returning id"))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from storage.objects returning id")).rows,
    ).toHaveLength(0);
    await as(b);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
});

it("isolates email recovery ciphertext and prevents cross-vault replacement", async () => {
  await as(a);
  const packet = JSON.stringify({
    v: 1,
    iv: "A".repeat(16),
    ct: "A".repeat(64),
  });
  await db.query(
    "insert into vault_email_recovery(owner_id,vault_id,email,sealed_key) values($1,$2,$3,$4)",
    [a, vid, "owner@gmail.com", packet],
  );
  expect(
    (await db.query("select email from vault_email_recovery")).rows,
  ).toEqual([{ email: "owner@gmail.com" }]);
  await as(b);
  expect(
    (await db.query("select * from vault_email_recovery")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "update vault_email_recovery set email='other@gmail.com' returning owner_id",
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "insert into vault_email_recovery(owner_id,vault_id,email,sealed_key) values($1,$2,$3,$4)",
      [a, vid, "other@gmail.com", packet],
    ),
  ).rejects.toThrow();
  await as(a);
  await expect(
    db.query(
      "update vault_email_recovery set vault_id='20000000-0000-4000-8000-000000000099'",
    ),
  ).rejects.toThrow();
  await expect(
    db.query("update vault_email_recovery set sealed_key='{}'"),
  ).rejects.toThrow();
  await expect(db.query("delete from vault_email_recovery")).rejects.toThrow(
    "permission denied",
  );
});
