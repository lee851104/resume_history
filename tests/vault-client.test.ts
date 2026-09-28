import { describe, it, expect, vi } from "vitest";
import { createVault, encryptJson, decryptJson } from "@/lib/crypto/vault";
import { VaultClient, emptySnapshot } from "@/lib/vault/client";
const owner = "10000000-0000-4000-8000-000000000001";
describe("encrypted client data boundary", () => {
  it("sends ciphertext only, preserves records through reload and refuses after locking", async () => {
    const setup = await createVault(owner, "A long private password!");
    const initial = emptySnapshot();
    initial.resumes.push({
      id: "20000000-0000-4000-8000-000000000001",
      originalName: "secret.pdf",
      displayName: "私人履歷",
      size: 100,
      contentType: "application/pdf",
      createdAt: "2026-09-28T00:00:00Z",
    });
    let row = {
      envelope: setup.envelope,
      payload: await encryptJson(
        setup.key,
        owner,
        setup.envelope.vaultId,
        initial,
      ),
      revision: 0,
    };
    const writes: string[] = [];
    const transport = async <T>(
      _url: string,
      init?: RequestInit,
    ): Promise<T> => {
      if (init?.method === "PUT") {
        const text = String(init.body);
        writes.push(text);
        const v = JSON.parse(text);
        expect(v.expectedRevision).toBe(row.revision);
        row = { ...row, payload: v.payload, revision: row.revision + 1 };
      }
      return row as T;
    };
    const client = new VaultClient(owner, setup.key, row, transport);
    await client.saveApplication(
      {
        jobUrl: "https://private.example/my-job",
        resumeId: initial.resumes[0].id,
        appliedOn: "2026-09-28",
        status: "applied",
        company: null,
        title: null,
        notes: "機密備註",
        followUpOn: null,
      },
      "30000000-0000-4000-8000-000000000001",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain("private.example");
    expect(writes[0]).not.toContain("secret.pdf");
    expect(writes[0]).not.toContain("機密備註");
    const loaded = await client.load();
    expect(loaded.applications[0].jobUrl).toBe(
      "https://private.example/my-job",
    );
    const otherDevice = new VaultClient(owner, setup.key, row, transport);
    expect((await otherDevice.load()).applications).toEqual(
      loaded.applications,
    );
    const baseline = loaded.applications[0];
    const { id, platform, createdAt, updatedAt, ...edit } = baseline;
    await otherDevice.setStatus(id, "interviewing");
    await expect(
      client.saveApplication({ ...edit, notes: "stale change" }, id, baseline),
    ).rejects.toThrow("另一個裝置");
    const latest = await client.load();
    expect(latest.applications[0].status).toBe("interviewing");
    expect(latest.applications[0].notes).toBe("機密備註");
    client.destroy();
    await expect(client.load()).rejects.toThrow("鎖定");
  });
  it("does not duplicate a record if the encrypted write response is lost", async () => {
    const setup = await createVault(owner, "Another long password 123!");
    const initial = emptySnapshot();
    initial.resumes.push({
      id: "20000000-0000-4000-8000-000000000001",
      originalName: "x.pdf",
      displayName: "x",
      size: 10,
      contentType: "application/pdf",
      createdAt: "2026-09-28T00:00:00Z",
    });
    let row = {
      envelope: setup.envelope,
      payload: await encryptJson(
        setup.key,
        owner,
        setup.envelope.vaultId,
        initial,
      ),
      revision: 0,
    };
    const transport = async <T>(
      _url: string,
      init?: RequestInit,
    ): Promise<T> => {
      if (init?.method === "PUT") {
        row = {
          ...row,
          payload: JSON.parse(String(init.body)).payload,
          revision: row.revision + 1,
        };
        throw Error("response lost");
      }
      return row as T;
    };
    const client = new VaultClient(owner, setup.key, row, transport);
    const data = {
      jobUrl: "https://example.com",
      resumeId: initial.resumes[0].id,
      appliedOn: "2026-09-28",
      status: "applied" as const,
      company: null,
      title: null,
      notes: null,
      followUpOn: null,
    };
    await client.saveApplication(data, "30000000-0000-4000-8000-000000000001");
    expect((await client.load()).applications).toHaveLength(1);
  });
});
