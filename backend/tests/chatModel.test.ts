import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekChatModel, ModelUnavailableError } from "../src/assistant/chatModel.js";

const model = new DeepSeekChatModel({ apiKey: "test", baseUrl: "https://model.test", model: "m" });
const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "Hola" } }] }), { status: 200 });
const dropped = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

afterEach(() => vi.unstubAllGlobals());

describe("DeepSeekChatModel", () => {
  it("retries once when the connection drops", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(dropped()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    await expect(model.complete([{ role: "user", content: "hola" }], [])).resolves.toEqual({
      content: "Hola",
      toolCalls: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once when the model is busy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    await expect(model.complete([{ role: "user", content: "hola" }], [])).resolves.toMatchObject({ content: "Hola" });
  });

  it("gives up kindly, naming the cause for the log", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(dropped()));
    const error = await model.complete([{ role: "user", content: "hola" }], []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelUnavailableError);
    expect((error as ModelUnavailableError).detail).toBe("fetch failed (ECONNRESET)");
  });
});
