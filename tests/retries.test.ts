import { describe, it, expect } from "vitest";
import { checkRetry } from "@/lib/domain/retries";
import { uploadResumeOnce, UploadState } from "@/lib/resumes/upload";
describe("idempotent application retry", () => {
  it("accepts exact retry but rejects changed content instead of losing edits", () => {
    const existing = {
      job_url: "https://example.com",
      notes: "original",
      resume_id: "a",
    };
    expect(() => checkRetry(existing, { ...existing })).not.toThrow();
    expect(() =>
      checkRetry(existing, { ...existing, notes: "changed" }),
    ).toThrow("已儲存");
    expect(() => checkRetry(existing, { ...existing, resume_id: "b" })).toThrow(
      "已儲存",
    );
  });
});
describe("recovering uploaded resume", () => {
  it("retries finalization with the same prepared id after response loss", async () => {
    const state: UploadState = {};
    const ids: string[] = [];
    let finishCount = 0;
    const deps = {
      prepare: async () => ({
        resumeId: "one",
        path: "one.pdf",
        token: "token",
      }),
      upload: async () => {},
      finalize: async (id: string) => {
        ids.push(id);
        if (finishCount++ === 0) throw Error("response lost");
        return id;
      },
    };
    await expect(uploadResumeOnce(state, deps)).rejects.toThrow(
      "response lost",
    );
    expect(await uploadResumeOnce(state, deps)).toBe("one");
    expect(ids).toEqual(["one", "one"]);
    expect(state.prepared?.resumeId).toBe("one");
  });
  it("recovers if upload committed but upload response was lost", async () => {
    const state: UploadState = {};
    let uploadAttempts = 0;
    let remoteExists = false;
    const deps = {
      prepare: async () => ({
        resumeId: "one",
        path: "one.pdf",
        token: "token",
      }),
      upload: async () => {
        uploadAttempts++;
        remoteExists = true;
        throw Error("upload response lost");
      },
      finalize: async (id: string) => {
        if (!remoteExists) throw Error("not uploaded");
        return id;
      },
    };
    expect(await uploadResumeOnce(state, deps)).toBe("one");
    expect(uploadAttempts).toBe(1);
  });
});
