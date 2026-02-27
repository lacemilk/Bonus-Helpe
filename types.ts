export interface RosterItem {
  id: string;
  name: string;
  is_eligible_default: number;
}

export interface Period {
  id: string;
  name: string;
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

export type View = 'periods' | 'roster' | 'period_detail';
