import type { Application, ResumeVersion } from "./domain/types";
export function applicationRow(r: Record<string, unknown>): Application {
  return {
    id: r.id as string,
    jobUrl: r.job_url as string,
    company: r.company as string | null,
    title: r.title as string | null,
    platform: r.platform as string,
    appliedOn: r.applied_on as string,
    status: r.status as Application["status"],
    resumeId: r.resume_id as string,
    notes: r.notes as string | null,
    followUpOn: r.follow_up_on as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
export function resumeRow(r: Record<string, unknown>): ResumeVersion {
  return {
    id: r.id as string,
    originalName: r.original_name as string,
    displayName: r.display_name as string,
    size: Number(r.size),
    contentType: r.content_type as string,
    createdAt: r.created_at as string,
  };
}
export function applicationFields(v: Record<string, unknown>) {
  const names: Record<string, string> = {
    jobUrl: "job_url",
    company: "company",
    title: "title",
    appliedOn: "applied_on",
    status: "status",
    resumeId: "resume_id",
    notes: "notes",
    followUpOn: "follow_up_on",
  };
  return Object.fromEntries(
    Object.entries(v)
      .filter(([key]) => key in names)
      .map(([key, value]) => [names[key], value]),
  );
}
