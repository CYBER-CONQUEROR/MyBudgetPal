import React, { useState } from 'react';
import { Plus, Target, TrendingUp } from 'lucide-react';
import { SavingsGoal, Deposit } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { CreateGoal } from './CreateGoal';
import { EditGoal } from './EditGoal';
import { DeleteConfirmation } from './DeleteConfirmation';
import { GoalCard } from './GoalCard';
import { GoalDetails } from './GoalDetails';
import { formatCurrency, calculateProgress } from '../utils/calculations';

export const SavingManagement: React.FC = () => {
  const [goals, setGoals] = useLocalStorage<SavingsGoal[]>('savings-goals', []);
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const handleCreateGoal = (goalData: Omit<SavingsGoal, 'id' | 'currentAmount' | 'deposits' | 'createdDate'>) => {
    const newGoal: SavingsGoal = {
      ...goalData,
      id: crypto.randomUUID(),
      currentAmount: 0,
      deposits: [],
      createdDate: new Date().toISOString()
    };

    setGoals(prev => [...prev, newGoal]);
    setShowCreateGoal(false);
  };

  const handleAddDeposit = (goalId: string, depositData: Omit<Deposit, 'id'>) => {
    const deposit: Deposit = {
      ...depositData,
      id: crypto.randomUUID()
    };

    setGoals(prev => prev.map(goal => {
      if (goal.id === goalId) {
        return {
          ...goal,
          currentAmount: goal.currentAmount + deposit.amount,
          deposits: [...goal.deposits, deposit]
        };
      }
      return goal;
    }));
  };

  const handleUpdateGoal = (updatedGoal: SavingsGoal) => {
    setGoals(prev => prev.map(goal => 
      goal.id === updatedGoal.id ? updatedGoal : goal
    ));
    setEditingGoal(null);
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals(prev => prev.filter(goal => goal.id !== goalId));
    setDeletingGoal(null);
    if (selectedGoal === goalId) {
      setSelectedGoal(null);
    }
  };

  const totalSaved = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const completedGoals = goals.filter(goal => calculateProgress(goal).isComplete).length;

  const selectedGoalData = selectedGoal ? goals.find(g => g.id === selectedGoal) : null;
  const editingGoalData = editingGoal ? goals.find(g => g.id === editingGoal) : null;
  const deletingGoalData = deletingGoal ? goals.find(g => g.id === deletingGoal) : null;

  if (selectedGoalData) {
    return (
      <GoalDetails
        goal={selectedGoalData}
        onBack={() => setSelectedGoal(null)}
        onAddDeposit={handleAddDeposit}
        onUpdateGoal={handleUpdateGoal}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Saving Management</h1>
            <p className="text-gray-600">Track your progress and achieve your financial goals</p>
          </div>
          <button
            onClick={() => setShowCreateGoal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2 shadow-lg"
          >
            <Plus className="h-5 w-5" />
            New Goal
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Saved</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSaved)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <Target className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Target</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalTarget)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Completed Goals</p>
                <p className="text-2xl font-bold text-gray-900">{completedGoals} / {goals.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No savings goals yet</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Create your first savings goal to start tracking your progress and stay motivated 
            to reach your financial targets.
          </p>
          <button
            onClick={() => setShowCreateGoal(true)}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2 mx-auto shadow-lg"
          >
            <Plus className="h-5 w-5" />
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => setSelectedGoal(goal.id)}
              onEdit={(e) => {
                e.stopPropagation();
                setEditingGoal(goal.id);
              }}
              onDelete={(e) => {
                e.stopPropagation();
                setDeletingGoal(goal.id);
              }}
            />
          ))}
        </div>
      )}

      {showCreateGoal && (
        <CreateGoal
          onCreateGoal={handleCreateGoal}
          onClose={() => setShowCreateGoal(false)}
          existingGoals={goals}
        />
      )}

      {editingGoalData && (
        <EditGoal
          goal={editingGoalData}
          onUpdateGoal={handleUpdateGoal}
          onClose={() => setEditingGoal(null)}
          existingGoals={goals}
        />
      )}

      {deletingGoalData && (
        <DeleteConfirmation
          goal={deletingGoalData}
          onConfirm={() => handleDeleteGoal(deletingGoalData.id)}
          onCancel={() => setDeletingGoal(null)}
        />
      )}
    </div>
  );
};