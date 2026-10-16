import {
  MerchantService,
  type OnboardInput,
} from "../src/merchants/merchantService.js";
import { PaymentFlows } from "../src/openPayments/flows.js";
import { computeInteractHash } from "../src/openPayments/hash.js";
import type { Interaction } from "../src/openPayments/records.js";
import { Store } from "../src/storage/store.js";
import {
  AUTH_SERVER,
  COOP,
  NOW,
  SAVINGS,
  createFakeOperations,
} from "./fakeOperations.js";

export const BASE_URL = "http://localhost:3000";
export const cop = (value: string) => ({
  value,
  assetCode: "COP",
  assetScale: 2,
});

/** Rosa's shop: 15% of each sale to a microcredit until 300,000 COP, 5% to savings, 30,000 COP/day cap. */
export const ROSA: OnboardInput = {
  name: "Tienda Doña Rosa",
  wallet: "$ilp.interledger-test.dev/bob",
  dailyCap: "30000",
  rules: [
    {
      label: "Microcrédito",
      kind: "debt",
      destination: COOP,
      sharePercent: 15,
      outstanding: "300000",
    },
    {
      label: "Fondo de emergencia",
      kind: "savings",
      destination: SAVINGS,
      sharePercent: 5,
    },
  ],
};

/** Wires the MiPlante services to the in-memory Open Payments fake. */
export function setupMiPlante() {
  const clock = { now: NOW };
  const now = () => clock.now;
  const { ops, deliver } = createFakeOperations();
  const store = new Store();
  const flows = new PaymentFlows(ops, store, {
    publicBaseUrl: BASE_URL,
    allowedWalletHosts: ["ilp.interledger-test.dev"],
    now,
  });
  const merchants = new MerchantService(flows, store, { now });

  /** What the wallet appends to the finish URL when its owner approves. */
  const approve = (interaction: Interaction) => ({
    interactRef: "ref-1",
    hash: computeInteractHash({
      clientNonce: interaction.clientNonce,
      interactNonce: interaction.finishNonce,
      interactRef: "ref-1",
      authServerUrl: AUTH_SERVER,
    }),
  });
  const approveMandate = (mandateId: string) =>
    flows.completeMandate(
      mandateId,
      approve(store.getMandate(mandateId)!.interaction!),
    );
  const approvePayment = (paymentId: string) =>
    flows.completePayment(
      paymentId,
      approve(store.getPayment(paymentId)!.interaction!),
    );

  /** Onboards Rosa and approves her daily-capped grant. */
  const onboardRosa = async (overrides: Partial<OnboardInput> = {}) => {
    const { merchant } = await merchants.onboard({ ...ROSA, ...overrides });
    await approveMandate(store.getMerchant(merchant.id)!.mandateId);
    return merchant.id;
  };

  return {
    clock,
    now,
    ops,
    deliver,
    store,
    flows,
    merchants,
    approve,
    approveMandate,
    approvePayment,
    onboardRosa,
  };
}
