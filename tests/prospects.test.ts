import { it, expect } from "vitest";
import { snapshotSchema } from "@/lib/vault/snapshot";
import { VaultClient, emptySnapshot } from "@/lib/vault/client";
import { createVault, encryptJson } from "@/lib/crypto/vault";
it("loads existing encrypted snapshots with an empty job shortlist", () => {
  expect(
    snapshotSchema.parse({ v: 1, applications: [], resumes: [] }).prospects,
  ).toEqual([]);
});
it("imports without a resume, skips duplicates and converts a shortlist job atomically", async () => {
  const owner = "10000000-0000-4000-8000-000000000001";
  const keys = await createVault(owner, "Private shortlist password!");
  let row = {
    envelope: keys.envelope,
    payload: await encryptJson(
      keys.key,
      owner,
      keys.envelope.vaultId,
      emptySnapshot(),
    ),
    revision: 0,
  };
  const writes: string[] = [];
  const request = async <T>(_url: string, init?: RequestInit): Promise<T> => {
    if (init?.method === "PUT") {
      const v = JSON.parse(String(init.body));
      expect(v.expectedRevision).toBe(row.revision);
      writes.push(String(init.body));
      row = { ...row, payload: v.payload, revision: row.revision + 1 };
    }
    return row as T;
  };
  const client = new VaultClient(owner, keys.key, row, request);
  const entries = [
    {
      jobUrl: "https://private.example/jobs/1",
      company: "私人公司",
      title: "Python 工程師",
      notes: "AI 建議",
    },
  ];
  expect(await client.importProspects(entries)).toEqual({
    added: 1,
    skipped: 0,
  });
  expect(await client.importProspects(entries)).toEqual({
    added: 0,
    skipped: 1,
  });
  let snapshot = await client.load();
  expect(snapshot.applications).toHaveLength(0);
  expect(snapshot.resumes).toHaveLength(0);
  const job = snapshot.prospects[0];
  await client.setProspectStatus(job.id, "ready");
  snapshot = await client.load();
  expect(snapshot.prospects[0].status).toBe("ready");
  snapshot.resumes.push({
    id: "20000000-0000-4000-8000-000000000001",
    originalName: "x.pdf",
    displayName: "x",
    size: 10,
    contentType: "application/pdf",
    createdAt: "2026-09-28T00:00:00Z",
  });
  row = {
    ...row,
    payload: await encryptJson(
      keys.key,
      owner,
      keys.envelope.vaultId,
      snapshot,
    ),
    revision: row.revision + 1,
  };
  const data = {
    jobUrl: job.jobUrl,
    company: job.company,
    title: job.title,
    notes: job.notes,
    resumeId: snapshot.resumes[0].id,
    appliedOn: "2026-09-28",
    status: "applied" as const,
    followUpOn: null,
  };
  const id = "30000000-0000-4000-8000-000000000001";
  await expect(
    client.saveApplication(data, id, undefined, job),
  ).rejects.toThrow("更新");
  await client.saveApplication(data, id, undefined, snapshot.prospects[0]);
  await client.saveApplication(data, id, undefined, snapshot.prospects[0]);
  const result = await client.load();
  expect(result.applications).toHaveLength(1);
  expect(result.prospects[0].applicationId).toBe(id);
  expect(result.prospects[0].status).toBe("applied");
  await expect(client.setProspectStatus(job.id, "review")).rejects.toThrow(
    "已投遞",
  );
  await expect(
    client.saveApplication(
      data,
      "30000000-0000-4000-8000-000000000002",
      undefined,
      result.prospects[0],
    ),
  ).rejects.toThrow("已投遞");
  for (const body of writes) {
    expect(body).not.toContain("private.example");
    expect(body).not.toContain("私人公司");
  }
});
