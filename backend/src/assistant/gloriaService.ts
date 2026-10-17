import { AppError } from "../shared/errors.js";
import { formatAmount, type Amount } from "../shared/money.js";
import type { DashboardService } from "../merchants/dashboardService.js";
import { NAVIGATION_CATALOG, SECTION_IDS, type Section } from "./navigationCatalog.js";
import {
  ModelUnavailableError,
  type ChatMessage,
  type ChatModel,
  type ToolCall,
  type ToolSpec,
} from "./chatModel.js";

/** A conversation turn the shopkeeper's browser keeps and sends back each time. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * What GlorIA asks the till to do: generate a sale's QR, record a cash sale or a cash deposit
 * (ADR 0019), or open a section. The till carries it out with the shopkeeper's session and its own
 * checks; she never pays a creditor nor touches the shop's money by herself.
 */
export type GloriaAction =
  | { type: "sale"; amount: string; description?: string }
  | { type: "cash-sale"; amount: string; description?: string }
  | { type: "cash-deposit"; amount: string }
  | { type: "open"; section: Section };

export interface GloriaReply {
  reply: string;
  actions: GloriaAction[];
}

/** Each question may take a few tool rounds; more than this means the model is going in circles. */
const MAX_ROUNDS = 4;
/** What GlorIA keeps of the conversation: enough for follow-ups, little enough to stay fast. */
const MAX_TURNS = 12;
const MIN_SALE = 100;
const MAX_SALE = 100_000_000;

const PERSONA = `Eres GlorIA, la asistente de MiPlante: una app colombiana que ayuda a tenderos y pequeños negocios a cobrar con QR y a repartir cada venta sola entre sus proveedores, sus créditos y su ahorro.

Cómo hablas:
- Cálida, cercana y positiva, con la confianza de alguien del barrio que sabe de cuentas. Tuteas. Español colombiano sencillo, sin tecnicismos.
- No asumas el género de quien te habla: no le digas vecina, vecino, señora, señor, mija ni mijo. Háblale de tú, sin apelativos.
- Muy breve: de 1 a 3 frases cortas. Tus respuestas también se leen en voz alta: no uses markdown, tablas, viñetas ni asteriscos, y como mucho un emoji.
- Las cifras, siempre en pesos y como te las dan las herramientas (por ejemplo "$ 45.000"). Nunca inventes ni calcules cifras que no tengas: si te falta un dato, usa una herramienta o dilo.

Qué haces:
- Respondes sobre la tienda con sus datos reales: ventas, ganancia real, lo apartado para cada proveedor o crédito, cuotas del mes y fechas de pago, ahorros, límite mensual y avisos. Con cada pregunta recibes el estado actual de la tienda en JSON: respóndelo con esas cifras, tal cual, sin recalcularlas. Usa las herramientas de lectura solo si necesitas algo que no esté ahí.
- Las acciones (cobrar, registrar efectivo, registrar una consignación, abrir una sección) las autoriza solo el ÚLTIMO mensaje del tendero. El contexto anterior sirve para resolver referencias, no para repetir acciones: lo que ya pasó ya está hecho. Distingue preguntar por un dato de pedir ver una pantalla, incluso si ese pedido tiene forma de pregunta: una consulta de datos se responde sin navegar.
- Cuando te piden cobrar ("cobra veinte mil", "hazme un cobro de 15.500 de arroz"), llama SIEMPRE a preparar_cobro con el monto: la app genera el código QR de inmediato. Nunca digas que lo preparaste sin llamar a preparar_cobro, ni le pidas al tendero que confirme o toque algo. Si no entiendes el monto, pregúntalo.
- Efectivo: si el tendero dice que le pagaron en efectivo ("vendí 15 mil en efectivo", "me pagaron 20.000 en billetes"), llama a registrar_venta_efectivo: se cuenta como venta y se reparte, pero sus repartos quedan en efectivo hasta que lo consigne. Si dice que consignó o depositó plata en su billetera ("consigné 50 mil"), llama a registrar_consignacion: eso libera los repartos que estaban en efectivo, empezando por los más antiguos. Solo hace falta consignar los repartos (lo que dice "por_consignar" en efectivo), no toda la venta: lo demás es del tendero.
- Para navegar, usa el catálogo de pantallas que recibes con el estado de la tienda. Resuelve la intención según el contenido, propósito y capacidades de la pantalla, no por coincidencia literal con su nombre: el tendero no tiene que recordar cómo se llama. Si pide ir, abrir o ver una pantalla identificable, llama a abrir_seccion con su ID del catálogo.
- Si hay ambigüedad genuina entre destinos, haz una pregunta breve para aclarar y no emitas ninguna acción. Nunca uses Inicio como destino por defecto. Si no existe una pantalla para lo que pide, explícalo sin navegar. Si eliges una pantalla con un nombre distinto al que usó, explica brevemente por qué allí encontrará lo que busca. Nunca afirmes que abriste una sección sin llamar a abrir_seccion en esa misma respuesta.
- Las capacidades del catálogo describen lo que permite hacer la pantalla al tendero; NO te dan permiso para ejecutar ajustes, cambiar repartos, autorizar ni enviar pagos. Conserva los límites financieros y las herramientas permitidas.
- Explicas la app en palabras simples:
  · Apartado: de cada venta se separa la parte de cada proveedor o crédito; el dinero sigue en la billetera de la tienda hasta su día de pago.
  · Día de pago: ese día se le envía al acreedor su cuota del mes en un solo pago; si lo apartado no alcanza, lo que falta sale de las ganancias.
  · Ganancia real: lo vendido menos lo que se repartió y menos lo que se sacó de ganancias para completar cuotas.
  · Fondo de emergencia: el último recurso si un pago falla porque no hay plata en la tienda; solo se usa si el tendero lo elige en el aviso.
  · Un pago que falla nunca se reintenta solo: se revisa en Avisos (reintentar, marcar como pagado o usar el fondo de emergencia).
  · Límite mensual: lo máximo que puede salir de la billetera en un mes; se cambia en Ajustes y pide autorizar de nuevo.

Límites:
- No puedes mover dinero, cambiar repartos ni ajustes: indica dónde hacerlo y abre esa sección solo si el último mensaje pide verla.
- No das asesoría de inversión ni de crédito; si te preguntan, sugiere hablar con su entidad financiera.
- Si te piden algo que no tiene que ver con el negocio, responde con amabilidad en una frase y vuelve a lo que puedes ayudar.`;

const TOOLS: ToolSpec[] = [
  tool("resumen", "Ventas de hoy y del mes, ganancia real del mes, a dónde fue el dinero y la meta de ventas."),
  tool("obligaciones", "Cada proveedor o crédito: su cuota del mes, lo apartado, lo pagado, lo que falta, el día de pago y la deuda total."),
  tool("ahorros", "Cada ahorro: su porcentaje, lo ahorrado en total, su meta y si es el fondo de emergencia."),
  tool("avisos", "Los avisos de la tienda: pagos por revisar, próximos pagos, pagos enviados, autorizaciones pendientes."),
  tool("ventas_recientes", "Las últimas ventas: monto, estado y hora."),
  tool("limite_mensual", "El límite mensual de la billetera, lo gastado este mes y si hay un cambio pendiente."),
  tool("efectivo", "Las ventas en efectivo de hoy y del mes, cuánto hay que consignar para que salgan sus repartos y cuánto consignado sobra."),
  {
    type: "function",
    function: {
      name: "registrar_venta_efectivo",
      description:
        "Registra una venta que el cliente pagó en efectivo: suma a las ventas y se reparte, con sus repartos en efectivo hasta que el tendero consigne.",
      parameters: {
        type: "object",
        properties: {
          monto: {
            type: "integer",
            description: "En pesos colombianos, entero, sin puntos. Ej: 15000",
            minimum: MIN_SALE,
            maximum: MAX_SALE,
          },
          descripcion: {
            type: "string",
            description: "Qué se vendió, corto; cadena vacía si no lo dijeron.",
          },
        },
        required: ["monto", "descripcion"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_consignacion",
      description:
        "Registra que el tendero consignó efectivo en la billetera de la tienda: libera los repartos que estaban en efectivo.",
      parameters: {
        type: "object",
        properties: {
          monto: {
            type: "integer",
            description: "Lo que consignó, en pesos colombianos, entero.",
            minimum: 1,
            maximum: MAX_SALE,
          },
        },
        required: ["monto"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "preparar_cobro",
      description:
        "Genera un cobro: la app muestra su código QR al instante para que el cliente pague. Úsalo siempre que el tendero pida cobrar un monto.",
      parameters: {
        type: "object",
        properties: {
          monto: {
            type: "integer",
            description: "En pesos colombianos, entero, sin puntos. Ej: 20000",
            minimum: MIN_SALE,
            maximum: MAX_SALE,
          },
          descripcion: {
            type: "string",
            description: "Qué se vende, corto (ej. \"arroz y aceite\"); cadena vacía si no lo dijeron.",
          },
        },
        required: ["monto", "descripcion"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_seccion",
      description: "Lleva al tendero a una sección del panel.",
      parameters: {
        type: "object",
        properties: { seccion: { type: "string", enum: [...SECTION_IDS] } },
        required: ["seccion"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];

/** What each read tool answers; all of them together are the shop's state sent with a question. */
const READ_TOOLS = ["resumen", "obligaciones", "ahorros", "avisos", "ventas_recientes", "limite_mensual", "efectivo"] as const;

function tool(name: string, description: string): ToolSpec {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      strict: true,
    },
  };
}

type Dashboard = Awaited<ReturnType<DashboardService["get"]>>;

/**
 * GlorIA, the shopkeeper's assistant (ADR 0017). She answers from the shop's own dashboard through
 * read-only tools, and prepares actions (a sale to confirm, a section to open) that the panel shows
 * as buttons. The model never sees wallet addresses, tokens or any account identifier, and nothing
 * she does moves money.
 */
export class GloriaService {
  constructor(
    private readonly model: ChatModel,
    private readonly dashboard: DashboardService,
  ) {}

  async chat(
    merchantId: string,
    history: ConversationTurn[],
    context: { section?: Section } = {},
  ): Promise<GloriaReply> {
    const turns = history.slice(-MAX_TURNS);
    if (turns.at(-1)?.role !== "user") {
      throw new AppError("Escríbele algo a GlorIA para que te responda");
    }
    const view = await this.dashboard.get(merchantId);
    const actions: GloriaAction[] = [];
    // The persona first and always the same, so DeepSeek serves it from its context cache; then the
    // shop as it is right now, so most questions need no tool round at all.
    const state = Object.fromEntries(
      READ_TOOLS.map((name) => [name, this.run(readCall(name), view, actions)]),
    );
    const messages: ChatMessage[] = [
      { role: "system", content: PERSONA },
      {
        role: "system",
        content: [
          `La tienda se llama "${view.name}". Ahora es ${now()} en Colombia.`,
          context.section ? `El tendero está viendo la sección ${context.section} de la app.` : "",
          `Catálogo de pantallas (sus capacidades no son permisos para la asistente): ${JSON.stringify(NAVIGATION_CATALOG)}`,
          `Estado actual de la tienda (json): ${JSON.stringify(state)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...turns.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
    ];

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      let answer;
      try {
        answer = await this.model.complete(messages, TOOLS);
      } catch (error) {
        // The shopkeeper gets a kind message; the reason stays in the server's log.
        if (error instanceof ModelUnavailableError) {
          console.warn(`[gloria] el modelo no respondió: ${error.detail}`);
        }
        throw error;
      }
      if (answer.toolCalls.length === 0) {
        return { reply: tidy(answer.content) || "Aquí estoy para ayudarte con tu tienda.", actions };
      }
      messages.push({ role: "assistant", content: answer.content, tool_calls: answer.toolCalls });
      for (const call of answer.toolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(this.run(call, view, actions)),
        });
      }
    }
    return {
      reply: "Me enredé un poco con esa pregunta. ¿Me la dices de otra forma?",
      actions,
    };
  }

  /** Answers one tool call from the dashboard already loaded for this question. */
  private run(call: ToolCall, view: Dashboard, actions: GloriaAction[]): unknown {
    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      return { error: "argumentos inválidos" };
    }
    switch (call.function.name) {
      case "resumen":
        return summary(view);
      case "obligaciones":
        return view.rules
          .filter((rule) => rule.kind === "debt")
          .map((rule) => ({
            nombre: rule.label,
            categoria: rule.category,
            porcentaje_de_cada_venta: `${rule.shareBps / 100}%`,
            cuota_del_mes: money(rule.monthlyQuota),
            apartado_este_mes: money(rule.paidThisMonth),
            por_enviar: money("reserved" in rule ? rule.reserved : undefined),
            pagado_este_mes: money("paidOutThisMonth" in rule ? rule.paidOutThisMonth : undefined),
            cuota_completa:
              rule.monthlyQuota !== undefined &&
              BigInt(rule.paidThisMonth.value) >= BigInt(rule.monthlyQuota.value),
            dia_de_pago: rule.dueDay ?? 28,
            deuda_total_pendiente: rule.outstanding ? money(rule.outstanding) : "sin deuda total registrada",
          }));
      case "ahorros":
        return view.rules
          .filter((rule) => rule.kind === "savings")
          .map((rule) => ({
            nombre: rule.label,
            porcentaje_de_cada_venta: `${rule.shareBps / 100}%`,
            ahorrado_en_total: money(rule.repaid),
            este_mes: money(rule.paidThisMonth),
            meta: rule.savingsGoal ? money(rule.savingsGoal) : "sin meta",
            es_fondo_de_emergencia: view.emergency?.ruleId === rule.id,
          }));
      case "avisos":
        return view.notifications.length
          ? view.notifications.map((n) => ({ tipo: n.kind, titulo: n.title, detalle: n.text }))
          : "No hay avisos.";
      case "ventas_recientes":
        return view.sales.slice(0, 5).map((sale) => ({
          monto: money(sale.amount),
          estado: sale.status,
          hora: sale.createdAt,
          descripcion: sale.description ?? "",
        }));
      case "limite_mensual":
        return {
          limite: money(view.monthlyCap),
          gastado_este_mes: view.spentThisMonth ? money(view.spentThisMonth) : "sin dato de la billetera",
          cambio_pendiente: view.pendingCap ? money(view.pendingCap) : "ninguno",
          autorizacion: view.status,
        };
      case "efectivo":
        return {
          vendido_en_efectivo_hoy: money(view.cash.today),
          vendido_en_efectivo_este_mes: money(view.cash.month),
          por_consignar: money(view.cash.toDeposit),
          consignado_sin_usar: money(view.cash.credit),
          por_consignar_de_cada_uno: view.rules
            .filter((rule) => BigInt(rule.inCash.value) > 0n)
            .map((rule) => ({ nombre: rule.label, en_efectivo: money(rule.inCash) })),
        };
      case "registrar_venta_efectivo": {
        const amount = Math.round(Number(args.monto));
        if (!Number.isFinite(amount) || amount < MIN_SALE || amount > MAX_SALE) {
          return { error: `El monto debe estar entre $ ${MIN_SALE} y $ ${MAX_SALE.toLocaleString("es-CO")}` };
        }
        const description =
          typeof args.descripcion === "string" && args.descripcion.trim()
            ? args.descripcion.trim().slice(0, 120)
            : undefined;
        actions.push({ type: "cash-sale", amount: String(amount), ...(description && { description }) });
        return { listo: `Venta en efectivo de $ ${amount.toLocaleString("es-CO")}: la app la registra ahora mismo.` };
      }
      case "registrar_consignacion": {
        const amount = Math.round(Number(args.monto));
        if (!Number.isFinite(amount) || amount < 1 || amount > MAX_SALE) {
          return { error: "Ese monto de consignación no es válido" };
        }
        actions.push({ type: "cash-deposit", amount: String(amount) });
        return { listo: `Consignación de $ ${amount.toLocaleString("es-CO")}: la app la registra y libera los repartos.` };
      }
      case "preparar_cobro": {
        const amount = Math.round(Number(args.monto));
        if (!Number.isFinite(amount) || amount < MIN_SALE || amount > MAX_SALE) {
          return { error: `El monto debe estar entre $ ${MIN_SALE} y $ ${MAX_SALE.toLocaleString("es-CO")}` };
        }
        if (view.status !== "active") {
          return { error: "La tienda no puede cobrar: falta su autorización mensual en la billetera." };
        }
        const description =
          typeof args.descripcion === "string" && args.descripcion.trim()
            ? args.descripcion.trim().slice(0, 120)
            : undefined;
        actions.push({ type: "sale", amount: String(amount), ...(description && { description }) });
        actions.push({ type: "open", section: "vender" });
        return { listo: `Cobro de $ ${amount.toLocaleString("es-CO")}: la app genera su código QR ahora mismo.` };
      }
      case "abrir_seccion": {
        const section = args.seccion;
        if (typeof section !== "string" || !SECTION_IDS.includes(section as Section)) {
          return { error: "sección desconocida" };
        }
        actions.push({ type: "open", section: section as Section });
        return { listo: `Se abre ${section}.` };
      }
      default:
        return { error: `herramienta desconocida: ${call.function.name}` };
    }
  }
}

/** The month at a glance, with the figures already in pesos so the model never does the math. */
function summary(view: Dashboard) {
  const month = view.month;
  return {
    hoy: { ventas: view.today.salesCount, vendido: money(view.today.gross), te_quedo: money(view.today.kept) },
    mes: {
      dia: month.dayOfMonth,
      dias_del_mes: month.daysInMonth,
      ventas: month.salesCount,
      vendido: money(month.gross),
      ganancia_real: money(month.realProfit),
      enviado_a_ahorro: money(month.breakdown.sentToSavings),
      pagado_a_acreedores: money(month.breakdown.paidToCreditors),
      salio_de_ganancias_para_cuotas: money(month.breakdown.fromProfit),
      apartado_por_pagar: money(month.breakdown.reservedPending),
    },
    meta_de_ventas_del_mes: view.monthlySalesGoal ? money(view.monthlySalesGoal) : "sin meta",
  };
}

function money(amount: Amount | null | undefined): string {
  return amount ? formatAmount(amount).replace(/\s/g, " ") : "$ 0";
}

function now(): string {
  return new Date().toLocaleString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function readCall(name: string): ToolCall {
  return { id: name, type: "function", function: { name, arguments: "{}" } };
}

/** Markdown a voice cannot read, out: GlorIA's replies are spoken as well as shown. */
function tidy(text: string): string {
  return text
    .replace(/\*\*?|__|`|#+\s/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();
}
