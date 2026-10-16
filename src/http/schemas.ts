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
