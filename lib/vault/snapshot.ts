import { prospectSchema } from "@/lib/jobs/import";
import { z } from "zod";
import {
  applicationSchema,
  idSchema,
  MAX_FILE_SIZE,
  mimeTypes,
} from "@/lib/domain/validation";
export const resumeSchema = z
  .object({
    id: idSchema,
    originalName: z.string().min(1).max(200),
    displayName: z.string().min(1).max(200),
    size: z.number().int().min(1).max(MAX_FILE_SIZE),
    contentType: z.enum([mimeTypes.pdf, mimeTypes.doc, mimeTypes.docx]),
    createdAt: z.string().datetime(),
  })
  .strict();
const storedApplication = applicationSchema.extend({
  id: idSchema,
  platform: z.string().max(300),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const snapshotSchema = z
  .object({
    v: z.literal(1),
    applications: z.array(storedApplication).max(5000),
    resumes: z.array(resumeSchema).max(5000),
    prospects: z.array(prospectSchema).max(5000).default([]),
  })
  .strict()
  .refine((s) => {
    const files = new Set(s.resumes.map((r) => r.id));
    return (
      files.size === s.resumes.length &&
      new Set(s.applications.map((a) => a.id)).size === s.applications.length &&
      s.applications.every((a) => files.has(a.resumeId)) &&
      new Set(s.prospects.map((j) => j.id)).size === s.prospects.length &&
      s.prospects.every((j) =>
        j.status === "applied"
          ? !!j.applicationId &&
            s.applications.some((a) => a.id === j.applicationId)
          : j.applicationId === null,
      )
    );
  }, "Invalid encrypted references");
export type Snapshot = z.infer<typeof snapshotSchema>;
