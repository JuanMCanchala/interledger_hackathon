import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatModel, ChatReply, ToolSpec } from "../src/assistant/chatModel.js";
import { GloriaService } from "../src/assistant/gloriaService.js";
import { NAVIGATION_CATALOG, SECTION_IDS } from "../src/assistant/navigationCatalog.js";
import { assistantChat } from "../src/http/schemas.js";
import { SECTION_IDS as FRONTEND_SECTION_IDS } from "../../frontend/src/app/core/navigation-intent.js";
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

  it.each(SECTION_IDS)("turns a validated tool call into an open action for %s", async (section) => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([
      { content: "", toolCalls: [call("abrir_seccion", { seccion: section })] },
      { content: "Te llevo allí.", toolCalls: [] },
    ]);
    const answer = await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: `Abre ${section}` }]);
    expect(answer.actions).toEqual([{ type: "open", section }]);
  });

  it.each(["admin", "estadísticas", "Inicio", "", null, 7, ["inicio"], {}].map((section) => ({ section })))(
    "rejects an unknown tool destination without defaulting to Inicio: %j",
    async ({ section }) => {
      const { env, id } = await shopWithSale();
      const model = new ScriptedModel([
        { content: "", toolCalls: [call("abrir_seccion", { seccion: section })] },
        { content: "No existe esa pantalla.", toolCalls: [] },
      ]);
      const answer = await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: "Abre esa pantalla" }]);
      expect(answer.actions).toEqual([]);
      expect(JSON.parse(model.seen[1]!.messages.at(-1)!.content as string)).toEqual({ error: "sección desconocida" });
    },
  );

  it("keeps the frontend IDs, catalog, tool enum and request schema in parity, including efectivo", async () => {
    expect(SECTION_IDS).toEqual(FRONTEND_SECTION_IDS);
    expect(Object.keys(NAVIGATION_CATALOG)).toEqual([...SECTION_IDS]);
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([{ content: "Aquí estoy.", toolCalls: [] }]);
    await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: "Hola" }], { section: "efectivo" });
    const open = model.seen[0]!.tools.find((t) => t.function.name === "abrir_seccion")!;
    expect(open.function.parameters).toMatchObject({ properties: { seccion: { enum: [...SECTION_IDS] } } });
    expect(Object.values(assistantChat.shape.section.unwrap().enum)).toEqual([...SECTION_IDS]);
    for (const section of SECTION_IDS) {
      expect(assistantChat.parse({ messages: [{ role: "user", content: "Hola" }], section }).section).toBe(section);
    }
    expect(assistantChat.safeParse({ messages: [{ role: "user", content: "Hola" }], section: "admin" }).success).toBe(false);
    expect(model.seen[0]!.messages[1]!.content).toContain("viendo la sección efectivo");
  });

  it("sends the full screen catalog and navigation boundaries to the model", async () => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([{ content: "¿Qué quieres revisar?", toolCalls: [] }]);
    await new GloriaService(model, env.dashboard).chat(id, [
      { role: "user", content: "Muéstrame las ventas" },
      { role: "assistant", content: "Están en Inicio." },
      { role: "user", content: "Abre esa pantalla" },
    ]);
    const [persona, context] = model.seen[0]!.messages;
    expect(context!.content).toContain(JSON.stringify(NAVIGATION_CATALOG));
    for (const entry of Object.values(NAVIGATION_CATALOG)) {
      expect(entry.purpose).not.toBe("");
      expect(entry.content).not.toBe("");
      expect(entry.capabilities).not.toBe("");
    }
    expect(persona!.content).toContain("no por coincidencia literal");
    expect(persona!.content).toContain("una consulta de datos se responde sin navegar");
    expect(persona!.content).toContain("solo el ÚLTIMO mensaje");
    expect(persona!.content).toContain("El contexto anterior sirve para resolver referencias");
    expect(persona!.content).toContain("Nunca uses Inicio como destino por defecto");
    expect(persona!.content).toContain("NO te dan permiso para ejecutar ajustes");
    expect(persona!.content).toContain("Nunca afirmes que abriste una sección sin llamar a abrir_seccion");
  });

  // These scripts verify the response contract, not the real model's semantic understanding.
  it.each([
    ["Muéstrame cómo voy", "¿Quieres ver las ventas del negocio o el avance de tus metas?"],
    ["¿Cuánto vendí hoy?", "Llevas $ 10.000."],
    ["Abre el inventario", "No hay una pantalla de inventario."],
    ["Abre Inicio", "Inicio abierto."],
  ])("does not synthesize actions from a scripted text-only reply to %s", async (request, reply) => {
    const { env, id } = await shopWithSale();
    const model = new ScriptedModel([{ content: reply, toolCalls: [] }]);
    const answer = await new GloriaService(model, env.dashboard).chat(id, [{ role: "user", content: request }]);
    expect(answer).toEqual({ reply, actions: [] });
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

  it("records cash sales and deposits through the till, and knows what is in cash", async () => {
    const { env, id } = await shopWithSale();
    await env.cash.recordSale(id, { amount: "20000" });
    const model = new ScriptedModel([
      {
        content: "",
        toolCalls: [
          call("registrar_venta_efectivo", { monto: 15000, descripcion: "pan" }),
          call("registrar_consignacion", { monto: 3000 }, "deposit"),
        ],
      },
      { content: "Listo.", toolCalls: [] },
    ]);
    const answer = await new GloriaService(model, env.dashboard).chat(id, [
      { role: "user", content: "vendí 15 mil de pan en efectivo y consigné 3 mil" },
    ]);
    expect(answer.actions).toEqual([
      { type: "cash-sale", amount: "15000", description: "pan" },
      { type: "cash-deposit", amount: "3000" },
    ]);
    // The till does it, not GlorIA: nothing was recorded yet.
    expect((await env.store.listSales({ merchantId: id })).filter((s) => s.method === "cash")).toHaveLength(1);
    const state = JSON.parse((model.seen[0]!.messages[1]!.content as string).split("(json): ")[1]!);
    expect(state.efectivo).toMatchObject({ vendido_en_efectivo_hoy: "$ 20.000", por_consignar: "$ 3.000" });
  });

  it("needs a question from the shopkeeper", async () => {
    const { env, id } = await shopWithSale();
    const gloria = new GloriaService(new ScriptedModel([]), env.dashboard);
    await expect(gloria.chat(id, [{ role: "assistant", content: "hola" }])).rejects.toThrow(/Escríbele/);
  });
});
