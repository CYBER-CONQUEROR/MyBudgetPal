import { SavingsGoal } from '../types';

export const calculateSavingsTargets = (targetAmount: number, targetDate: string) => {
  const target = new Date(targetDate);
  const now = new Date();
  const timeDiff = target.getTime() - now.getTime();
  const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
  const weeksLeft = Math.ceil(daysLeft / 7);
  const monthsLeft = Math.ceil(daysLeft / 30);

  return {
    daysLeft: Math.max(1, daysLeft),
    weeksLeft: Math.max(1, weeksLeft),
    monthsLeft: Math.max(1, monthsLeft),
    weeklyTarget: Math.ceil(targetAmount / Math.max(1, weeksLeft)),
    monthlyTarget: Math.ceil(targetAmount / Math.max(1, monthsLeft))
  };
};

export const calculateProgress = (goal: SavingsGoal) => {
  const progressPercentage = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  const remainingAmount = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const isComplete = goal.currentAmount >= goal.targetAmount;
  
  const { daysLeft } = calculateSavingsTargets(remainingAmount, goal.targetDate);
  
  return {
    progressPercentage: Math.round(progressPercentage * 100) / 100,
    remainingAmount,
    isComplete,
    daysLeft,
    isOverdue: daysLeft < 0 && !isComplete
  };
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};