export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  createdDate: string;
  weeklyTarget: number;
  monthlyTarget: number;
  deposits: Deposit[];
}

export interface Deposit {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface NavigationItem {
  name: string;
  path: string;
  icon: React.ComponentType<any>;
}