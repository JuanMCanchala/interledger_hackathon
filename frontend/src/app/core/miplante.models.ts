export interface Amount {
  value: string;
  assetCode: string;
  assetScale: number;
}

export type Tone = 'ok' | 'wait' | 'bad' | 'info' | 'neutral';

export interface StatusInfo {
  text: string;
  tone: Tone;
}

export interface WalletInfo {
  wallet: string;
  name: string;
  currency: string;
  assetCode: string;
}

export interface UserView {
  id: string;
  name: string;
  email: string;
}

export interface MeResponse {
  user: UserView;
  merchant: { id: string; name: string } | null;
}

export interface RuleView {
  id: string;
  label: string;
  category?: string;
  kind: 'debt' | 'savings';
  destination: string;
  shareBps: number;
  monthlyQuota?: Amount;
  outstanding?: Amount;
  savingsGoal?: Amount;
  dueDay?: number;
  paidThisMonth?: Amount;
  paidOutThisMonth?: Amount;
  reserved?: Amount;
  repaid?: Amount;
}

export interface SettlementItemView {
  ruleId?: string;
  label: string;
  kind: 'debt' | 'savings';
  amount: Amount;
  status: 'processing' | 'completed' | 'failed' | 'skipped' | 'reserved';
  capped?: boolean;
  error?: string;
}

export interface SettlementView {
  status: 'pending' | 'running' | 'done' | 'skipped';
  reason?: string;
  kept?: Amount;
  items?: SettlementItemView[];
}

export interface PaymentSteps {
  request?: boolean;
  authorization?: boolean;
  execution?: boolean;
  completion?: boolean;
}

export interface SaleView {
  id: string;
  merchantId?: string;
  merchantName?: string;
  amount: Amount;
  pending?: Amount;
  description?: string;
  status: 'open' | 'awaiting-consent' | 'processing' | 'paid' | 'failed';
  error?: string;
  payUrl?: string;
  checkoutUrl?: string;
  createdAt: string;
  paidAt?: string;
  payment?: {
    receivedAmount?: Amount;
    steps?: PaymentSteps;
  };
  settlement?: SettlementView;
}

export interface PayoutView {
  id: string;
  ruleId: string;
  label: string;
  amount: Amount;
  topUp?: Amount;
  reason: 'manual' | 'due-date';
  status: 'processing' | 'completed' | 'failed';
  resolution?: 'marked-paid' | 'retried' | 'emergency-used';
  error?: string;
  createdAt: string;
}

export interface NoticeView {
  id: string;
  kind: 'payout-failed' | 'payout-due' | 'payout-sent' | 'consent' | 'cap-pending';
  tone: 'bad' | 'wait' | 'info' | 'ok';
  title: string;
  text: string;
  createdAt: string;
  payoutId?: string;
  actions?: ('retry' | 'mark-paid' | 'use-emergency')[];
}

export interface DaySummary {
  date: string;
  gross: Amount;
  kept?: Amount;
  realProfit?: Amount;
  salesCount: number;
}

export interface MonthSummary {
  gross: Amount;
  kept: Amount;
  realProfit?: Amount;
  salesCount: number;
  dayOfMonth: number;
  daysInMonth: number;
  days: DaySummary[];
  breakdown?: {
    sentToSavings: Amount;
    paidToCreditors: Amount;
    fromProfit: Amount;
    reservedPending: Amount;
  };
}

export interface MerchantDashboard {
  id: string;
  name: string;
  wallet: string;
  status: 'awaiting-consent' | 'active' | 'rejected' | 'revoked' | 'failed';
  asset: { assetCode: string; assetScale: number };
  monthlyCap: Amount;
  pendingCap?: Amount;
  spentThisMonth?: Amount;
  monthlySalesGoal?: Amount;
  today: {
    gross: Amount;
    kept: Amount;
    allocated: Amount;
    salesCount: number;
  };
  month: MonthSummary;
  rules: RuleView[];
  sales: SaleView[];
  payouts?: PayoutView[];
  notifications?: NoticeView[];
  emergency?: {
    ruleId: string;
    label?: string;
    status: 'active' | 'awaiting-consent' | 'rejected' | 'revoked' | 'failed';
  };
}

export interface SandboxPayment {
  id: string;
  kind?: string;
  status: string;
  sender?: string;
  receiver?: string;
  debitAmount?: Amount;
  receiveAmount?: Amount;
  receivedAmount?: Amount;
  description?: string;
  incomingPaymentUrl?: string;
  outgoingPaymentUrl?: string;
  steps?: Record<string, boolean>;
  error?: string;
}

export interface SandboxMandate {
  id: string;
  status: string;
  sender: string;
  maxAmount: Amount;
  interval?: string;
  spent?: { debitAmount?: Amount };
  payments: SandboxPayment[];
  description?: string;
  steps?: Record<string, boolean>;
  error?: string;
}
