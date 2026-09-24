export type SubscriptionPlan = 'freemium' | 'basic' | 'standard';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export const FREE_MAX_PLAYERS = 200;
export const FREE_MONTHLY_SPINS = 25;

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: 'Free' | 'Basic' | 'Standard';
  priceCents: number;
  currency: 'PHP';
  billingInterval: 'month';
  maxPlayers: number;
  monthlySpins: number;
  adsEnabled: boolean;
  features: string[];
  active: boolean;
}

export interface UserSubscription {
  subscriptionId: string;
  uid: string;
  email: string;
  planType: SubscriptionPlan;
  status: SubscriptionStatus;
  promoCode?: string;
  referralCode?: string;
  amountPaid: number;
  currency: string;
  isTrial: boolean;
  trialDays?: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export const planCatalog: PlanDefinition[] = [
  {
    id: 'freemium',
    name: 'Free',
    priceCents: 0,
    currency: 'PHP',
    billingInterval: 'month',
    maxPlayers: FREE_MAX_PLAYERS,
    monthlySpins: FREE_MONTHLY_SPINS,
    adsEnabled: true,
    features: ['Raffle machine and history', 'Participant list editor'],
    active: true
  },
  {
    id: 'basic',
    name: 'Basic',
    priceCents: 6000,
    currency: 'PHP',
    billingInterval: 'month',
    maxPlayers: 1000,
    monthlySpins: 500,
    adsEnabled: false,
    features: ['Raffle machine and history', 'Participant list editor', 'Ad-free experience', 'Priority support'],
    active: true
  },
  {
    id: 'standard',
    name: 'Standard',
    priceCents: 59900,
    currency: 'PHP',
    billingInterval: 'month',
    maxPlayers: 20000,
    monthlySpins: 3000,
    adsEnabled: false,
    features: ['Advanced raffle tools', 'Full raffle history', 'Participant management', 'Ad-free experience', 'Early access to new features', 'Priority support'],
    active: true
  }
];