import Anthropic from "@anthropic-ai/sdk";

// Thin wrapper: every LLM call in this app returns structured data through a
// forced tool call, so nothing downstream parses free-form text.

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export async function structured<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: { type: "object", ...opts.schema } as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("LLM returned no structured output");
  return block.input as T;
}
