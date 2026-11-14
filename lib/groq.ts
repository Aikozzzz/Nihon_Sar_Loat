import { AppError, metric } from "./database.ts";

export function requireGroq() {
  if (!process.env.GROQ_API_KEY) throw new AppError("AI is unavailable. Configure the server’s Groq API key and try again.", 503);
}

export async function structured(
  name: string, schema: object, instructions: string, input: unknown, operation: "extract" | "reading",
  signal?: AbortSignal,
): Promise<unknown> {
  requireGroq();
  const start = Date.now();
  let result = "unavailable";
  let tokens = 0;
  try {
    const timeout = AbortSignal.timeout(45_000);
    const response = await fetch(process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [{ role: "system", content: instructions }, { role: "user", content: JSON.stringify(input) }],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        max_completion_tokens: operation === "extract" ? 8192 : 4096,
      }),
    });
    if (response.status === 429) {
      result = "rate_limited";
      throw new AppError("Groq is busy. Try again in a moment.", 503);
    }
    if (!response.ok) throw new AppError("Groq is unavailable. Try again in a moment.", 503);
    result = "invalid";
    const data = await response.json();
    tokens = Number(data.usage?.total_tokens) || 0;
    if (data.choices?.[0]?.finish_reason !== "stop" || typeof data.choices?.[0]?.message?.content !== "string") {
      throw new AppError("Groq returned incomplete data. Try again.", 502);
    }
    const value: unknown = JSON.parse(data.choices[0].message.content);
    result = "received";
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (result === "invalid") throw new AppError("Groq returned invalid data. Try again.", 502);
    throw new AppError("Groq is unavailable. Try again in a moment.", 503);
  } finally {
    await metric(operation, result, start, tokens);
  }
}
