import { it, expect, vi, afterEach } from "vitest";
import { createVault, encryptJson, decryptFile } from "@/lib/crypto/vault";
import { VaultClient, emptySnapshot } from "@/lib/vault/client";
const storage = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    storage: { from: () => ({ uploadToSignedUrl: storage.upload }) },
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("uploads only encrypted bytes, retries a lost finalize response, and downloads the exact original file", async () => {
  const owner = "10000000-0000-4000-8000-000000000001";
  const keys = await createVault(owner, "A private file password 123!");
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
  const raw = new TextEncoder().encode(
    "%PDF-1.7\nPRIVATE RESUME CONTENT\n%%EOF",
  );
  const file = new File([raw], "confidential-resume.pdf", {
    type: "application/pdf",
  });
  let encrypted = new Uint8Array(),
    fileId = "",
    ready = false,
    finalizeLost = true;
  const bodies: string[] = [];
  storage.upload.mockImplementation(
    async (path: string, _token: string, blob: Blob) => {
      expect(path).not.toContain(file.name);
      encrypted = new Uint8Array(await blob.arrayBuffer());
      expect(new TextDecoder().decode(encrypted)).not.toContain(
        "PRIVATE RESUME",
      );
      return { error: null };
    },
  );
  const transport = async <T>(url: string, init?: RequestInit): Promise<T> => {
    if (init?.body) bodies.push(String(init.body));
    if (url === "/api/vault") {
      if (init?.method === "PUT")
        row = {
          ...row,
          payload: JSON.parse(String(init.body)).payload,
          revision: row.revision + 1,
        };
      return row as T;
    }
    if (url === "/api/sealed-files") {
      const body = JSON.parse(String(init?.body));
      fileId = body.id;
      expect(body.size).toBe(raw.length + 29);
      return {
        id: fileId,
        path: owner + "/" + fileId + ".bin",
        token: "synthetic",
        ready,
      } as T;
    }
    expect(url).toBe("/api/sealed-files/" + fileId);
    if (init?.method === "POST") {
      ready = true;
      if (finalizeLost) {
        finalizeLost = false;
        throw Error("response lost");
      }
      return { ready } as T;
    }
    return { url: "https://storage.example/encrypted.bin" } as T;
  };
  const client = new VaultClient(owner, keys.key, row, transport);
  await expect(
    client.uploadResume(file, "機密履歷", "attempt"),
  ).rejects.toThrow("response lost");
  const id = await client.uploadResume(file, "機密履歷", "attempt");
  expect(storage.upload).toHaveBeenCalledTimes(1);
  expect((await client.load()).resumes).toHaveLength(1);
  expect(
    await decryptFile(keys.key, owner, keys.envelope.vaultId, id, encrypted),
  ).toEqual(raw);
  for (const body of bodies) {
    expect(body).not.toContain(file.name);
    expect(body).not.toContain("機密履歷");
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(encrypted)),
  );
  const downloaded = await client.downloadResume(id);
  expect(downloaded.meta.originalName).toBe(file.name);
  expect(downloaded.bytes).toEqual(raw);
  encrypted[encrypted.length - 1] ^= 1;
  await expect(client.downloadResume(id)).rejects.toThrow();
});
it("encrypts and decrypts a full 20 MB resume without changing its bytes", async () => {
  const { encryptFile } = await import("@/lib/crypto/vault");
  const owner = "test-owner",
    keys = await createVault(owner, "Another private password 123!");
  const bytes = new Uint8Array(20_000_000);
  bytes.set(new TextEncoder().encode("%PDF-1.7"));
  bytes[bytes.length - 1] = 42;
  const encrypted = await encryptFile(
    keys.key,
    owner,
    keys.envelope.vaultId,
    "file-id",
    bytes,
  );
  expect(encrypted.length).toBe(20_000_029);
  const result = await decryptFile(
    keys.key,
    owner,
    keys.envelope.vaultId,
    "file-id",
    encrypted,
  );
  expect(Buffer.compare(Buffer.from(result), Buffer.from(bytes))).toBe(0);
});
