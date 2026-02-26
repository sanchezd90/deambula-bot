import { z } from "zod";

export const IntentSchema = z.object({
  intent: z.enum(["name", "desire", "description", "other"]),
});

export type Intent = z.infer<typeof IntentSchema>["intent"];
