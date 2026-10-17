import { AppError } from "../shared/errors.js";

/** One turn of a conversation, in the OpenAI chat format DeepSeek speaks. */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatReply {
  content: string;
  toolCalls: ToolCall[];
}

/** What GlorIA needs from a language model; tests replace it with a scripted one. */
export interface ChatModel {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatReply>;
}

/** Thrown when the model cannot answer (down, slow, out of quota): GlorIA says so kindly. */
export class ModelUnavailableError extends AppError {
  constructor(detail: string) {
    super("GlorIA no está disponible en este momento. Intenta de nuevo en un rato.", 503);
    this.name = "ModelUnavailableError";
    this.detail = detail;
  }
  readonly detail: string;
}

const TIMEOUT_MS = 20_000;

/**
 * DeepSeek through its OpenAI-compatible chat API (ADR 0017). Thinking is off: GlorIA answers short
 * questions about the shop's own figures, which need speed more than reasoning, and in thinking mode
 * every tool turn would have to carry the reasoning back.
 */
export class DeepSeekChatModel implements ChatModel {
  constructor(
    private readonly options: { apiKey: string; baseUrl: string; model: string },
  ) {}

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatReply> {
    let res: Response;
    try {
      res = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          tools,
          tool_choice: "auto",
          thinking: { type: "disabled" },
          temperature: 0.4,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ModelUnavailableError(error instanceof Error ? error.message : String(error));
    }
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new ModelUnavailableError(`HTTP ${res.status}: ${body.error?.message ?? "sin detalle"}`);
    }
    const message = body.choices?.[0]?.message;
    return { content: message?.content ?? "", toolCalls: message?.tool_calls ?? [] };
  }
}
