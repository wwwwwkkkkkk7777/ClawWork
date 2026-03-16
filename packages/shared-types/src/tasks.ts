import { z } from "zod";

export const TaskTypeSchema = z.enum([
  "document_summary",
  "email_draft",
  "meeting_minutes",
  "weekly_report"
]);

export const ResultStyleSchema = z.enum([
  "default",
  "formal",
  "shorter",
  "boss_style",
  "client_style"
]);
