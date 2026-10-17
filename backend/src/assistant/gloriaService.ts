import { AppError } from "../shared/errors.js";
import { formatAmount, type Amount } from "../shared/money.js";
import type { DashboardService } from "../merchants/dashboardService.js";
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
 * Something GlorIA prepared for the shopkeeper to confirm with a tap. She never moves money: a sale
 * is only created when the shopkeeper confirms it, and paying still goes through their wallet.
 */
export type GloriaAction =
  | { type: "sale"; amount: string; description?: string }
  | { type: "open"; section: Section };

export interface GloriaReply {
  reply: string;
  actions: GloriaAction[];
}

const SECTIONS = ["inicio", "vender", "metas", "repartos", "ajustes", "avisos"] as const;
type Section = (typeof SECTIONS)[number];

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
- Respondes sobre la tienda con los datos reales de tus herramientas: ventas, ganancia real, lo apartado para cada proveedor o crédito, cuotas del mes y fechas de pago, ahorros, límite mensual y avisos.
- Preparas cobros cuando te lo piden ("cobra veinte mil" o "cobra 15.500 de arroz") con preparar_cobro. El tendero los confirma con un toque; tú nunca cobras ni pagas sola.
- Llevas a la sección correcta con abrir_seccion cuando ayuda (por ejemplo, Avisos si hay un pago por revisar). Solo di que abres una sección si de verdad llamas a abrir_seccion en esa misma respuesta.
- Explicas la app en palabras simples:
  · Apartado: de cada venta se separa la parte de cada proveedor o crédito; el dinero sigue en la billetera de la tienda hasta su día de pago.
  · Día de pago: ese día se le envía al acreedor su cuota del mes en un solo pago; si lo apartado no alcanza, lo que falta sale de las ganancias.
  · Ganancia real: lo vendido menos lo que se repartió y menos lo que se sacó de ganancias para completar cuotas.
  · Fondo de emergencia: el último recurso si un pago falla porque no hay plata en la tienda; solo se usa si el tendero lo elige en el aviso.
  · Un pago que falla nunca se reintenta solo: se revisa en Avisos (reintentar, marcar como pagado o usar el fondo de emergencia).
  · Límite mensual: lo máximo que puede salir de la billetera en un mes; se cambia en Ajustes y pide autorizar de nuevo.

Límites:
- No puedes mover dinero, cambiar repartos ni ajustes: indica dónde hacerlo y, si sirve, abre esa sección.
- No das asesoría de inversión ni de crédito; si te preguntan, sugiere hablar con su entidad financiera.
- Si te piden algo que no tiene que ver con el negocio, responde con amabilidad en una frase y vuelve a lo que puedes ayudar.`;

const TOOLS: ToolSpec[] = [
  tool("resumen", "Ventas de hoy y del mes, ganancia real del mes, a dónde fue el dinero y la meta de ventas."),
  tool("obligaciones", "Cada proveedor o crédito: su cuota del mes, lo apartado, lo pagado, lo que falta, el día de pago y la deuda total."),
  tool("ahorros", "Cada ahorro: su porcentaje, lo ahorrado en total, su meta y si es el fondo de emergencia."),
  tool("avisos", "Los avisos de la tienda: pagos por revisar, próximos pagos, pagos enviados, autorizaciones pendientes."),
  tool("ventas_recientes", "Las últimas ventas: monto, estado y hora."),
  tool("limite_mensual", "El límite mensual de la billetera, lo gastado este mes y si hay un cambio pendiente."),
  {
    type: "function",
    function: {
      name: "preparar_cobro",
      description:
        "Prepara un cobro para que el tendero lo confirme con un toque. Úsalo cuando pida cobrar un monto.",
      parameters: {
        type: "object",
        properties: {
          monto: { type: "number", description: "En pesos colombianos, entero. Ej: 20000" },
          descripcion: { type: "string", description: "Opcional: qué se vende, corto." },
        },
        required: ["monto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_seccion",
      description: "Lleva al tendero a una sección del panel.",
      parameters: {
        type: "object",
        properties: { seccion: { type: "string", enum: [...SECTIONS] } },
        required: ["seccion"],
      },
    },
  },
];

function tool(name: string, description: string): ToolSpec {
  return { type: "function", function: { name, description, parameters: { type: "object", properties: {} } } };
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

  async chat(merchantId: string, history: ConversationTurn[]): Promise<GloriaReply> {
    const turns = history.slice(-MAX_TURNS);
    if (turns.at(-1)?.role !== "user") {
      throw new AppError("Escríbele algo a GlorIA para que te responda");
    }
    const view = await this.dashboard.get(merchantId);
    const messages: ChatMessage[] = [
      { role: "system", content: `${PERSONA}\n\nLa tienda se llama "${view.name}". Hoy es ${today()}.` },
      ...turns.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
    ];
    const actions: GloriaAction[] = [];

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
        return { listo: `Cobro de $ ${amount.toLocaleString("es-CO")} preparado: el tendero lo confirma con un toque.` };
      }
      case "abrir_seccion": {
        const section = args.seccion;
        if (typeof section !== "string" || !SECTIONS.includes(section as Section)) {
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

function today(): string {
  return new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

/** Markdown a voice cannot read, out: GlorIA's replies are spoken as well as shown. */
function tidy(text: string): string {
  return text
    .replace(/\*\*?|__|`|#+\s/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();
}
