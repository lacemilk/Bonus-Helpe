export interface RosterItem {
  id: string;
  name: string;
  is_eligible_default: number;
}

export interface Period {
  id: string;
  name: string;
  period_code: string;
  payment_date?: string;
  actual_total_bonus: number;
  created_at: string;
}

export interface BonusEntry {
  id: string;
  period_id: string;
  person_id: string;
  person_name: string;
  vendor: string;
  unit_price: number;
  quantity: number;
  is_eligible: number;
}

export interface GroupBonus {
  id: string;
  name: string;
  period_code: string;
  payment_date?: string;
  total_amount: number;
  created_at: string;
  details: {
    person_id: string;
    person_name: string;
    sales: number;
    share: number;
    amount: number;
  }[];
}

export type View = 'periods' | 'roster' | 'period_detail' | 'group_calculator' | 'history' | 'history_period_detail' | 'history_group_detail';
