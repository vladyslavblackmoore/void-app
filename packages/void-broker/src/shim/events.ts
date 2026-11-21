import { z } from "zod"

const block = z.union([
  z.looseObject({ type: z.literal("text"), text: z.string() }),
  z.looseObject({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() }),
  z.looseObject({ type: z.string() }),
])

const assistant = z.looseObject({
  type: z.literal("assistant"),
  message: z.looseObject({ content: z.array(block) }),
})

const result = z.looseObject({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  errors: z.array(z.string()).optional(),
  terminal_reason: z.string().optional(),
})

const control = z.looseObject({
  type: z.literal("control_response"),
  response: z.looseObject({ request_id: z.string() }),
})

const event = z.union([assistant, result, control])

export type Block = z.infer<typeof block>
export type BinaryEvent = z.infer<typeof event>

export function parseEvent(line: string): BinaryEvent | undefined {
  try {
    const parsed = event.safeParse(JSON.parse(line))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
