import { query } from "@anthropic-ai/claude-agent-sdk";

export async function generateSessionName(
  turns: Array<{ role: string; content: string }>,
): Promise<string> {
  try {
    const transcript = turns
      .slice(-20)
      .map((t) => `${t.role}: ${t.content.slice(0, 200)}`)
      .join("\n");

    const result = query({
      prompt: `Summarize this conversation in 3-5 words as a kebab-case name suitable for a filename. Output ONLY the name, nothing else.\n\n${transcript}`,
      options: {
        maxTurns: 1,
        tools: [],
        allowedTools: [],
      },
    });

    for await (const msg of result) {
      if (msg.type === "assistant") {
        const text = msg.message.content.find(
          (b: { type: string }): b is { type: "text"; text: string } =>
            b.type === "text",
        );
        if (text) return slugify(text.text);
      }
    }
  } catch {
    // Fall through to fallback
  }

  return `session-${Date.now()}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
