import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatModel, ChatReply, ToolSpec } from "../src/assistant/chatModel.js";
import { GloriaService } from "../src/assistant/gloriaService.js";
import { COOP } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/** A model that follows a script: each turn it calls the given tools, then says the given text. */
class ScriptedModel implements ChatModel {
  readonly seen: { messages: ChatMessage[]; tools: ToolSpec[] }[] = [];
  constructor(private readonly script: ChatReply[]) {}
  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatReply> {
    this.seen.push({ messages: structuredClone(messages), tools });
    return this.script.shift() ?? { content: "…", toolCalls: [] };
  }
}

const call = (name: string, args: object = {}, id = name) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

const MICROCREDIT = {
  label: "Microcrédito",
  category: "Microcréditos",
  kind: "debt" as const,
  destination: COOP,
  sharePercent: 15,
  monthlyQuota: "20000",
  dueDay: 20,
};

async function shopWithSale() {
  const env = setupMiPlante();
  const id = await env.onboardRosa({ rules: [MICROCREDIT] });
  const { sale } = await env.sales.createSale(id, { amount: "10000" });
  const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
  env.deliver(request.incomingPaymentUrl, cop("1000000"));
  await env.sales.refresh(sale.id);
  return { env, id };
}

describe("GlorIA", () => {
  it("answers from the shop's own figures, already in pesos", async () => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([
      { content: "", toolCalls: [call("resumen"), call("obligaciones")] },
      { content: "¡Vas bien! Llevas **$ 10.000** este mes.", toolCalls: [] },
    ]);
    const gloria = new GloriaService(model, env.dashboard);

    const answer = await gloria.chat(id, [{ role: "user", content: "¿Cómo voy?" }]);

    // Markdown a voice cannot read is taken out.
    expect(answer).toEqual({ reply: "¡Vas bien! Llevas $ 10.000 este mes.", actions: [] });
    const toolResults = model.seen[1]!.messages.filter((m) => m.role === "tool");
    const resumen = JSON.parse(toolResults[0]!.content);
    expect(resumen.mes).toMatchObject({ vendido: "$ 10.000", ganancia_real: "$ 8.500" });
    const [debt] = JSON.parse(toolResults[1]!.content);
    expect(debt).toMatchObject({
      nombre: "Microcrédito",
      cuota_del_mes: "$ 20.000",
      por_enviar: "$ 1.500",
      dia_de_pago: 20,
      cuota_completa: false,
    });
  });

  it("never gives the model a wallet address, a token or an account id", async () => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([
      {
        content: "",
        toolCalls: ["resumen", "obligaciones", "ahorros", "avisos", "ventas_recientes", "limite_mensual"].map((n) =>
          call(n),
        ),
      },
      { content: "Listo.", toolCalls: [] },
    ]);
    await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: "Todo" }]);

    const sent = JSON.stringify(model.seen.map((s) => s.messages));
    expect(sent).not.toMatch(/https?:\/\//);
    expect(sent).not.toMatch(/\$ilp/);
    expect(sent).not.toContain(id);
    expect(sent).not.toMatch(/token/i);
  });

  it("prepares a sale for the shopkeeper to confirm, and moves no money", async () => {
    const { env, id } = await shopWithSale();
    const salesBefore = (await env.store.listSales({ merchantId: id })).length;
    const charges = env.ops.createOutgoingPayment.mock.calls.length;
    const model = new ScriptedModel([
      { content: "", toolCalls: [call("preparar_cobro", { monto: 20000, descripcion: "Arroz y aceite" })] },
      { content: "Listo, confirma el cobro de $ 20.000.", toolCalls: [] },
    ]);

    const answer = await new GloriaService(model, env.dashboard).chat(id, [
      { role: "user", content: "Cobra veinte mil de arroz y aceite" },
    ]);

    expect(answer.actions).toEqual([
      { type: "sale", amount: "20000", description: "Arroz y aceite" },
      { type: "open", section: "vender" },
    ]);
    expect((await env.store.listSales({ merchantId: id })).length).toBe(salesBefore);
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges);
  });

  it("refuses a sale outside the limits, or while the shop cannot charge", async () => {
    const { env, id } = await shopWithSale();
    const tooSmall = new ScriptedModel([
      { content: "", toolCalls: [call("preparar_cobro", { monto: 50 })] },
      { content: "Ese monto es muy pequeño.", toolCalls: [] },
    ]);
    const small = await new GloriaService(tooSmall, env.dashboard).chat(id, [{ role: "user", content: "cobra 50" }]);
    expect(small.actions).toEqual([]);
    expect(JSON.parse(tooSmall.seen[1]!.messages.at(-1)!.content as string).error).toMatch(/entre/);

    await env.flows.revokeMandate((await env.store.getMerchant(id))!.mandateId);
    const revoked = new ScriptedModel([
      { content: "", toolCalls: [call("preparar_cobro", { monto: 20000 })] },
      { content: "Primero autoriza.", toolCalls: [] },
    ]);
    const blocked = await new GloriaService(revoked, env.dashboard).chat(id, [{ role: "user", content: "cobra 20000" }]);
    expect(blocked.actions).toEqual([]);
  });

  it("opens a section when it helps, and only a real one", async () => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([
      { content: "", toolCalls: [call("abrir_seccion", { seccion: "avisos" }), call("abrir_seccion", { seccion: "admin" }, "x")] },
      { content: "Te llevo a Avisos.", toolCalls: [] },
    ]);
    const answer = await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: "¿Qué pasó?" }]);
    expect(answer.actions).toEqual([{ type: "open", section: "avisos" }]);
  });

  it("stops a model that keeps calling tools, and keeps only the recent conversation", async () => {
    const { env, id } = await shopWithSale();
    const loop = new ScriptedModel(Array.from({ length: 10 }, () => ({ content: "", toolCalls: [call("resumen")] })));
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `mensaje ${i}`,
    }));
    history.push({ role: "user", content: "¿y hoy?" });

    const answer = await new GloriaService(loop, env.dashboard).chat(id, history);

    expect(answer.reply).toMatch(/de otra forma/);
    expect(loop.seen).toHaveLength(4);
    const firstCall = loop.seen[0]!.messages;
    expect(firstCall[0]!.role).toBe("system");
    // The persona, then the shop as it is now, then the last 12 turns.
    expect(firstCall.length).toBe(2 + 12);
    expect(firstCall.at(-1)).toEqual({ role: "user", content: "¿y hoy?" });
  });

  it("sends the shop as it is now, so one call answers, with strict tools", async () => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([{ content: "Llevas $ 10.000 este mes.", toolCalls: [] }]);
    const answer = await new GloriaService(model, env.dashboard).chat(
      id,
      [{ role: "user", content: "¿Cómo voy?" }],
      { section: "metas" },
    );

    expect(answer.reply).toBe("Llevas $ 10.000 este mes.");
    expect(model.seen).toHaveLength(1);
    const [persona, now] = model.seen[0]!.messages;
    expect(persona!.content).toMatch(/^Eres GlorIA/);
    expect(now!.content).toContain("viendo la sección metas");
    const state = JSON.parse((now!.content as string).split("(json): ")[1]!);
    expect(state.resumen.mes).toMatchObject({ vendido: "$ 10.000" });
    expect(state.obligaciones[0]).toMatchObject({ nombre: "Microcrédito", cuota_del_mes: "$ 20.000" });
    expect(JSON.stringify(state)).not.toMatch(/https?:\/\/|\$ilp/);
    // Every tool in DeepSeek's strict mode: closed schemas, every property required.
    for (const tool of model.seen[0]!.tools) {
      expect(tool.function.strict).toBe(true);
      expect(tool.function.parameters).toMatchObject({ additionalProperties: false });
    }
  });

  it("needs a question from the shopkeeper", async () => {
    const { env, id } = await shopWithSale();
    const gloria = new GloriaService(new ScriptedModel([]), env.dashboard);
    await expect(gloria.chat(id, [{ role: "assistant", content: "hola" }])).rejects.toThrow(/Escríbele/);
  });
});
