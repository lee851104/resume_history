export const statuses = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof statuses)[number];
export const statusLabels: Record<ApplicationStatus, string> = {
  applied: "已投遞",
  interviewing: "面試中",
  offer: "錄取",
  rejected: "未錄取",
  withdrawn: "已撤回",
};
export interface Application {
  id: string;
  jobUrl: string;
  company: string | null;
  title: string | null;
  platform: string;
  appliedOn: string;
  status: ApplicationStatus;
  resumeId: string;
  notes: string | null;
  followUpOn: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ResumeVersion {
  id: string;
  originalName: string;
  displayName: string;
  size: number;
  contentType: string;
  createdAt: string;
}
export type NewApplication = Omit<
  Application,
  "id" | "platform" | "createdAt" | "updatedAt"
>;
