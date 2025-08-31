import React, { useState } from 'react';
import { ArrowLeft, Plus, TrendingUp, Calendar, DollarSign, Clock, Edit, Trash2 } from 'lucide-react';
import { SavingsGoal, Deposit } from '../types';
import { calculateProgress, formatCurrency, formatDate } from '../utils/calculations';
import { validateDepositAmount, validateDepositNote } from '../utils/validations';
import { FormField } from './FormField';

interface GoalDetailsProps {
  goal: SavingsGoal;
  onBack: () => void;
  onAddDeposit: (goalId: string, deposit: Omit<Deposit, 'id'>) => void;
  onUpdateGoal: (goal: SavingsGoal) => void;
  onEditGoal?: (goalId: string) => void;
  onDeleteGoal?: (goalId: string) => void;
}

export const GoalDetails: React.FC<GoalDetailsProps> = ({ 
  goal, 
  onBack, 
  onAddDeposit,
  onUpdateGoal,
  onEditGoal,
  onDeleteGoal
}) => {
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositErrors, setDepositErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  
  const progress = calculateProgress(goal);

  const handleDepositInputChange = (field: string, value: string) => {
    if (field === 'amount') {
      setDepositAmount(value);
    } else {
      setDepositNote(value);
    }

    // Clear error for this field when user starts typing
    if (depositErrors[field]) {
      setDepositErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleAddDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingDeposit(true);

    // Validate deposit
    const amountValidation = validateDepositAmount(depositAmount, progress.remainingAmount);
    const noteValidation = validateDepositNote(depositNote);

    const errors: { [key: string]: string } = {};
    if (!amountValidation.isValid) {
      errors.amount = amountValidation.errors[0];
    }
    if (!noteValidation.isValid) {
      errors.note = noteValidation.errors[0];
    }

    if (Object.keys(errors).length > 0) {
      setDepositErrors(errors);
      setIsSubmittingDeposit(false);
      return;
    }

    const amount = parseFloat(depositAmount);

    
    try {
      onAddDeposit(goal.id, {
        amount,
        date: new Date().toISOString(),
        note: depositNote.trim() || undefined
      });

      setDepositAmount('');
      setDepositNote('');
      setDepositErrors({});
      setShowDepositForm(false);
    } catch (error) {
      setDepositErrors({ general: 'Failed to add deposit. Please try again.' });
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const sortedDeposits = [...goal.deposits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 font-medium transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </button>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{goal.name}</h1>
              <div className="flex items-center gap-4 text-blue-100">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(goal.targetDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {progress.daysLeft > 0 ? `${progress.daysLeft} days left` : 'Overdue'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onEditGoal && (
                <button
                  onClick={() => onEditGoal(goal.id)}
                  className="p-2 text-blue-100 hover:text-white hover:bg-blue-500 rounded-lg transition-all"
                  title="Edit goal"
                >
                  <Edit className="h-5 w-5" />
                </button>
              )}
              {onDeleteGoal && (
                <button
                  onClick={() => onDeleteGoal(goal.id)}
                  className="p-2 text-blue-100 hover:text-white hover:bg-red-500 rounded-lg transition-all"
                  title="Delete goal"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Progress Overview */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Progress Overview</h2>
                  <span className={`text-2xl font-bold ${
                    progress.isComplete ? 'text-green-600' : 'text-blue-600'
                  }`}>
                    {progress.progressPercentage.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      progress.isComplete 
                        ? 'bg-gradient-to-r from-green-400 to-green-600' 
                        : 'bg-gradient-to-r from-blue-400 to-blue-600'
                    }`}
                    style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Current</p>
                    <p className="font-bold text-lg text-gray-900">
                      {formatCurrency(goal.currentAmount)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Target</p>
                    <p className="font-bold text-lg text-gray-900">
                      {formatCurrency(goal.targetAmount)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Remaining</p>
                    <p className={`font-bold text-lg ${
                      progress.isComplete ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(progress.remainingAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Savings Targets */}
              {!progress.isComplete && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <TrendingUp className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">Weekly Target</p>
                    <p className="font-bold text-xl text-blue-600">
                      {formatCurrency(goal.weeklyTarget)}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <Calendar className="h-6 w-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">Monthly Target</p>
                    <p className="font-bold text-xl text-green-600">
                      {formatCurrency(goal.monthlyTarget)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Add Deposit Section */}
            <div>
              {!showDepositForm ? (
                <button
                  onClick={() => setShowDepositForm(true)}
                  disabled={progress.isComplete}
                  className={`w-full rounded-lg py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                    progress.isComplete
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Plus className="h-5 w-5" />
                  {progress.isComplete ? 'Goal Completed' : 'Add Deposit'}
                </button>
              ) : (
                <form onSubmit={handleAddDeposit} className="space-y-4">
                  {depositErrors.general && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-red-800 text-sm">{depositErrors.general}</p>
                    </div>
                  )}

                  <FormField label="Deposit Amount" error={depositErrors.amount} required>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => handleDepositInputChange('amount', e.target.value)}
                        placeholder="100"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                          depositErrors.amount 
                            ? 'border-red-300 focus:ring-red-500' 
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                        required
                      />
                    </div>
                  </FormField>

                  <FormField label="Note (Optional)" error={depositErrors.note}>
                    <input
                      type="text"
                      value={depositNote}
                      onChange={(e) => handleDepositInputChange('note', e.target.value)}
                      placeholder="Weekly savings"
                      maxLength={100}
                      className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                        depositErrors.note 
                          ? 'border-red-300 focus:ring-red-500' 
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                  </FormField>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepositForm(false);
                        setDepositErrors({});
                        setDepositAmount('');
                        setDepositNote('');
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingDeposit}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                        isSubmittingDeposit
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isSubmittingDeposit ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Recent Deposits */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Deposits</h2>
            {sortedDeposits.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No deposits yet. Add your first deposit to get started!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {sortedDeposits.map((deposit) => (
                  <div
                    key={deposit.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(deposit.amount)}
                      </p>
                      {deposit.note && (
                        <p className="text-sm text-gray-600">{deposit.note}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(deposit.date)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};