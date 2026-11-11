export type BenefitWallet = {
  id: string;
  code: string;
  name: string;
  openingBalanceCents: number;
  openingDate: string;
  monthlyCreditCents: number;
  creditDay: number;
};

export type BenefitMovement = {
  id: string;
  walletId: string;
  kind: "credit" | "expense" | "adjustment";
  date: string;
  description: string;
  category: string | null;
  amountCents: number;
  notes: string | null;
  creditMonth: string | null;
};

export const benefitDelta = (item: BenefitMovement) => item.kind === "expense" ? -item.amountCents : item.amountCents;
export const benefitBalance = (wallet: BenefitWallet, movements: BenefitMovement[]) => wallet.openingBalanceCents + movements.reduce((total, item) => total + benefitDelta(item), 0);
