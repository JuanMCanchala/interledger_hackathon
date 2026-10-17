import { bogotaDay } from "../domain/calendar.js";
import { formatAmount, type Amount } from "../shared/money.js";
import type { MerchantRecord, PayoutRecord } from "./types.js";

/** How many days before a debt's due day its reminder shows. */
const REMIND_DAYS = 3;
/** How long a sent payout stays in the list. */
const SENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Notification {
  /** Stable while it means the same thing, so the panel can tell what was already seen. */
  id: string;
  kind: "payout-failed" | "payout-due" | "payout-sent" | "consent" | "cap-pending";
  tone: "bad" | "wait" | "info" | "ok";
  title: string;
  text: string;
  createdAt: string;
  /** For a failed payout: what the shopkeeper can do about it. */
  payoutId?: string;
  actions?: ("retry" | "mark-paid")[];
}

export interface NotificationInput {
  merchant: MerchantRecord;
  consent: string;
  /** Per debt rule: what is reserved now and how much of this month's quota is covered. */
  reserved: Record<string, Amount>;
  covered: Record<string, Amount>;
  payouts: PayoutRecord[];
  now: Date;
}

const TONE_ORDER = { bad: 0, wait: 1, info: 2, ok: 3 } as const;

/**
 * What the shopkeeper should know now, worked out from the shop's state rather than stored, so it
 * can never disagree with the money: failed payouts to review (they are never retried on their
 * own), the creditors to pay in the next days, the payouts sent lately and a consent missing.
 * Things to act on come first.
 */
export function buildNotifications({
  merchant,
  consent,
  reserved,
  covered,
  payouts,
  now,
}: NotificationInput): Notification[] {
  const list: Notification[] = [];
  const today = bogotaDay(now);
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const zero: Amount = { ...merchant.asset, value: "0" };

  if (consent !== "active") {
    list.push({
      id: `consent:${merchant.mandateId}:${consent}`,
      kind: "consent",
      tone: "wait",
      title: "Falta tu autorización mensual",
      text: "Mientras no la apruebes en tu billetera, tus ventas no se reparten ni se le paga a nadie.",
      createdAt: merchant.updatedAt,
    });
  }
  if (merchant.pendingCap) {
    list.push({
      id: `cap:${merchant.pendingCap.mandateId}`,
      kind: "cap-pending",
      tone: "wait",
      title: "Falta aprobar tu nuevo límite",
      text: `Pediste cambiar tu límite mensual a ${formatAmount(merchant.pendingCap.monthlyCap)}: apruébalo en tu billetera. Mientras tanto sigue el actual.`,
      createdAt: merchant.updatedAt,
    });
  }

  for (const payout of payouts) {
    if (payout.status === "failed" && !payout.resolvedAt) {
      list.push({
        id: `payout-failed:${payout.id}`,
        kind: "payout-failed",
        tone: "bad",
        title: `No se pudo confirmar el pago a ${payout.label}`,
        text:
          `${formatAmount(payout.amount)}${payout.error ? ` · ${payout.error}` : ""}. ` +
          `Revisa la billetera ${walletName(payout.destination)}: si el dinero llegó, márcalo como pagado; ` +
          "si no, reintenta el pago. No lo volvemos a intentar solos, para no pagar dos veces.",
        createdAt: payout.updatedAt,
        payoutId: payout.id,
        actions: ["retry", "mark-paid"],
      });
    } else if (
      payout.status === "completed" &&
      now.getTime() - Date.parse(payout.updatedAt) <= SENT_DAYS * DAY_MS
    ) {
      list.push({
        id: `payout-sent:${payout.id}`,
        kind: "payout-sent",
        tone: "ok",
        title: `Le pagaste ${formatAmount(payout.amount)} a ${payout.label}`,
        text:
          payout.resolution === "marked-paid"
            ? "Lo marcaste como pagado después de revisarlo."
            : payout.topUp
              ? `${formatAmount(payout.topUp)} salieron de tus ganancias para completar la cuota del mes.`
              : "Con lo que tenías apartado.",
        createdAt: payout.updatedAt,
      });
    }
  }

  for (const rule of merchant.rules) {
    if (rule.kind !== "debt") continue;
    const dueDay = rule.dueDay ?? 28;
    const daysLeft = dueDay - day;
    if (daysLeft < 0 || daysLeft > REMIND_DAYS) continue;
    const paid = payouts.some(
      (p) => p.ruleId === rule.id && p.month === month && p.reason === "due-date",
    );
    if (paid) continue;
    const held = reserved[rule.id] ?? zero;
    const quota = rule.monthlyQuota;
    const missing = quota ? BigInt(quota.value) - BigInt((covered[rule.id] ?? zero).value) : 0n;
    const when = daysLeft === 0 ? "Hoy" : daysLeft === 1 ? "Mañana" : `En ${daysLeft} días`;
    list.push({
      id: `payout-due:${rule.id}:${today}`,
      kind: "payout-due",
      tone: "info",
      title: `${when} le pagas a ${rule.label}`,
      text:
        quota && missing > 0n
          ? `Ya tienes ${formatAmount(held)} apartados. Para la cuota de ${formatAmount(quota)} faltan ${formatAmount({ ...quota, value: missing.toString() })}, que saldrán de tus ganancias.`
          : `Ya tienes ${formatAmount(held)} guardados: la cuota del mes está completa.`,
      createdAt: now.toISOString(),
    });
  }

  return list.sort(
    (a, b) =>
      TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.createdAt.localeCompare(a.createdAt),
  );
}

/** "https://ilp.interledger-test.dev/distribuidora-central" → "distribuidora-central". */
function walletName(url: string): string {
  try {
    const parsed = new URL(url.replace(/^\$/, "https://"));
    return parsed.pathname.replace(/^\//, "") || parsed.hostname;
  } catch {
    return url;
  }
}
