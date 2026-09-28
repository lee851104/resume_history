export interface PreparedUpload {
  resumeId: string;
  path: string;
  token: string;
}
export interface UploadState {
  prepared?: PreparedUpload;
  uploaded?: boolean;
  completedId?: string;
}
interface Dependencies {
  prepare: () => Promise<PreparedUpload>;
  upload: (prepared: PreparedUpload) => Promise<void>;
  finalize: (id: string) => Promise<string>;
}
export async function uploadResumeOnce(
  state: UploadState,
  deps: Dependencies,
): Promise<string> {
  if (state.completedId) return state.completedId;
  if (!state.prepared) state.prepared = await deps.prepare();
  if (!state.uploaded) {
    try {
      await deps.upload(state.prepared);
      state.uploaded = true;
    } catch (uploadError) {
      // A response can be lost after Storage accepts the bytes. Finalize the same object first.
      try {
        state.completedId = await deps.finalize(state.prepared.resumeId);
        state.uploaded = true;
        return state.completedId;
      } catch {
        throw uploadError;
      }
    }
  }
  state.completedId = await deps.finalize(state.prepared.resumeId);
  return state.completedId;
}
