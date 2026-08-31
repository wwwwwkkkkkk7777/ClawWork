import { z } from "zod";

const DevLoginSchema = z.object({
  nickname: z.string().min(1),
  email: z.string().email().optional()
});

export function parseDevLoginPayload(input: unknown) {
  return DevLoginSchema.parse(input);
}
