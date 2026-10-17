import { z } from "zod";
import { DURATION_PATTERN } from "../openPayments/interval.js";

const walletAddress = z.string().trim().min(3).max(300);
const decimalAmount = z
  .string()
  .trim()
  .max(30)
  .regex(/^\d+(\.\d+)?$/, "usa un número positivo, por ejemplo 12.50");
const description = z.string().trim().max(200).optional();
const amountType = z.enum(["receive", "send"]).default("receive");

export const walletAddressQuery = z.object({ url: walletAddress });

export const createPayment = z.object({
  sender: walletAddress,
  receiver: walletAddress,
  amount: decimalAmount,
  description,
});

export const createMandate = z.object({
  sender: walletAddress,
  maxAmount: decimalAmount,
  interval: z
    .string()
    .regex(DURATION_PATTERN, "duración ISO 8601, por ejemplo P1W o PT1M")
    .optional(),
  repetitions: z.number().int().min(1).max(1000).optional(),
  description,
});

export const chargeMandate = z.object({
  receiver: walletAddress,
  amount: decimalAmount,
  amountType,
  description,
});

export const splitMandate = z.object({
  receivers: z
    .array(z.object({ receiver: walletAddress, amount: decimalAmount }))
    .min(1)
    .max(10),
  amountType,
  description,
});

/** Params the wallet appends to the finish URL: interact_ref + hash, or result=grant_rejected. */
export const callbackQuery = z
  .object({
    interact_ref: z.string().max(500).optional(),
    hash: z.string().max(500).optional(),
    result: z.string().max(100).optional(),
  })
  .transform((query) => ({
    interactRef: query.interact_ref,
    hash: query.hash,
    result: query.result,
  }));

// MiPlante -----------------------------------------------------------------------------------------

const rule = z.object({
  label: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  kind: z.enum(["debt", "savings"]),
  destination: walletAddress,
  sharePercent: z.number().gt(0).max(99),
  monthlyQuota: decimalAmount.optional(),
  outstanding: decimalAmount.optional(),
  savingsGoal: decimalAmount.optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
});

export const changeCap = z.object({ monthlyCap: decimalAmount });

/** Which savings rule's wallet to keep as the last resort; the first one if not given. */
export const authorizeEmergency = z.object({ ruleId: z.uuid().optional() });

/** Pay one debt now, or every debt as if its due day had come (`due-date`, for the demo). */
export const payout = z.object({
  ruleId: z.uuid().optional(),
  reason: z.enum(["manual", "due-date"]).default("manual"),
});

export const shopSettings = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    monthlySalesGoal: decimalAmount.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "envía al menos un ajuste");

export const onboardMerchant = z.object({
  name: z.string().trim().min(1).max(80),
  wallet: walletAddress,
  monthlyCap: decimalAmount,
  rules: z.array(rule).min(1).max(10),
});

export const updateRules = z.object({
  rules: z
    .array(rule.extend({ id: z.uuid().optional() }))
    .min(1)
    .max(10)
    .refine(
      (rules) => {
        const ids = rules.flatMap((r) => (r.id ? [r.id] : []));
        return new Set(ids).size === ids.length;
      },
      { message: "una regla aparece dos veces" },
    ),
});

export const createSale = z.object({ amount: decimalAmount, description });

export const paySale = z.object({ customerWallet: walletAddress });

// Accounts ---------------------------------------------------------------------------------------

const email = z.string().trim().max(200).email("escribe un correo válido");

export const register = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z.string().min(8, "usa al menos 8 caracteres").max(200),
});

export const login = z.object({
  email,
  password: z.string().min(1).max(200),
});
