import { z } from "zod";

export const sensitivitySchema = z.enum(["personal", "work_summary_only", "restricted"]);
export type Sensitivity = z.infer<typeof sensitivitySchema>;

export const sourceCompletenessSchema = z.enum([
  "full",
  "partial",
  "reference_only",
  "unavailable",
  "export_backfilled",
]);
export type SourceCompleteness = z.infer<typeof sourceCompletenessSchema>;

export const sourceTypeSchema = z.enum(["manual", "chatgpt_export", "daily_log", "codex"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const openLoopStatusSchema = z.enum(["open", "waiting", "scheduled", "done", "dismissed"]);
export type OpenLoopStatus = z.infer<typeof openLoopStatusSchema>;

export const candidateTypeSchema = z.enum(["open_loop", "decision", "reference"]);
export type CandidateType = z.infer<typeof candidateTypeSchema>;

export const reviewStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  externalId?: string;
  completeness: SourceCompleteness;
  sensitivity: Sensitivity;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Capture {
  id: string;
  sourceId: string;
  text: string;
  sensitivity: Sensitivity;
  createdAt: string;
  version: number;
}

export interface Evidence {
  id: string;
  captureId: string;
  sourceId: string;
  quote?: string;
  locator?: string;
  createdAt: string;
}

export interface OpenLoopEvidence {
  evidence: Evidence;
  source: Source;
}

export interface OpenLoop {
  id: string;
  title: string;
  notes?: string;
  status: OpenLoopStatus;
  priority: number;
  dueAt?: string;
  scheduledFor?: string;
  sourceId?: string;
  sensitivity: Sensitivity;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ReviewCandidate {
  id: string;
  captureId: string;
  candidateType: CandidateType;
  title: string;
  summary?: string;
  status: ReviewStatus;
  sensitivity: Sensitivity;
  outcomeId?: string;
  outcomeAction?: "created" | "merged";
  outcomeVersion?: number;
  duplicateOf?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const captureInputSchema = z.object({
  text: z.string().trim().min(1).max(200_000),
  title: z.string().trim().min(1).max(300).optional(),
  sourceType: sourceTypeSchema.default("manual"),
  candidateType: candidateTypeSchema.optional(),
  sensitivity: sensitivitySchema.default("personal"),
});
export type CaptureInput = z.input<typeof captureInputSchema>;

export const openLoopPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().max(20_000).nullable().optional(),
    status: openLoopStatusSchema.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    scheduledFor: z.iso.datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "At least one field is required");
export type OpenLoopPatch = z.infer<typeof openLoopPatchSchema>;

export const reviewActionSchema = z
  .object({
    action: z.enum(["accept", "edit", "reject", "undo", "merge"]),
    expectedVersion: z.number().int().positive(),
    candidateType: candidateTypeSchema.optional(),
    title: z.string().trim().min(1).max(500).optional(),
    summary: z.string().max(20_000).nullable().optional(),
    status: openLoopStatusSchema.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    scheduledFor: z.iso.datetime().nullable().optional(),
    targetOpenLoopId: z.string().uuid().optional(),
    targetExpectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "merge" && (!value.targetOpenLoopId || !value.targetExpectedVersion)) {
      context.addIssue({
        code: "custom",
        path: ["targetOpenLoopId"],
        message: "Merge requires targetOpenLoopId and targetExpectedVersion",
      });
    }
  });
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const restoreInputSchema = z.object({
  backupFileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.sqlite$/, "Backup file name must be a local SQLite file name"),
  confirmation: z.string().min(1).max(300),
});
export type RestoreInput = z.infer<typeof restoreInputSchema>;

export interface RestoreResult {
  restoredFrom: string;
  preRestoreBackup: string;
  restoredAt: string;
  integrity: "ok";
}

export interface BackupInfo {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export const chatGptExportInputSchema = z.object({
  conversations: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        title: z.string().max(500).optional(),
        messages: z.array(
          z.object({
            id: z.string().max(500).optional(),
            role: z.string().max(100),
            content: z.string().max(500_000),
            createdAt: z.string().optional(),
          }),
        ),
      }),
    )
    .min(1)
    .max(1_000),
  sensitivity: sensitivitySchema.default("personal"),
});

export const dailyLogInputSchema = z.object({
  date: z.iso.date(),
  content: z.string().min(1).max(1_000_000),
  path: z.string().max(2_000).optional(),
  sensitivity: sensitivitySchema.default("personal"),
});

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface SearchResult {
  entityType: string;
  entityId: string;
  title: string;
  snippet: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceType?: SourceType;
  sourceLocator?: string;
}

export interface SanitizedExport {
  schemaVersion: 1;
  generatedAt: string;
  openLoops: OpenLoop[];
  decisions: Array<{ id: string; title: string; summary?: string; createdAt: string }>;
  references: Array<{ id: string; title: string; summary?: string; createdAt: string }>;
}
