import React, { useState } from 'react';
import { X, DollarSign, Calendar, Target, Save } from 'lucide-react';
import { SavingsGoal } from '../types';
import { calculateSavingsTargets } from '../utils/calculations';
import { validateGoalForm } from '../utils/validations';
import { FormField } from './FormField';

interface EditGoalProps {
  goal: SavingsGoal;
  onUpdateGoal: (goal: SavingsGoal) => void;
  onClose: () => void;
  existingGoals: SavingsGoal[];
}

export const EditGoal: React.FC<EditGoalProps> = ({ goal, onUpdateGoal, onClose, existingGoals }) => {
  const [formData, setFormData] = useState({
    name: goal.name,
    targetAmount: goal.targetAmount.toString(),
    targetDate: goal.targetDate.split('T')[0] // Convert to YYYY-MM-DD format
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [preview, setPreview] = useState<{
    weeklyTarget: number;
    monthlyTarget: number;
    daysLeft: number;
  } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }

    // Update preview when amount and date are provided
    if (formData.targetAmount && formData.targetDate && (name === 'targetAmount' || name === 'targetDate')) {
      const amount = name === 'targetAmount' ? parseFloat(value) : parseFloat(formData.targetAmount);
      const date = name === 'targetDate' ? value : formData.targetDate;
      
      if (amount > 0 && date) {
        try {
          const calculations = calculateSavingsTargets(amount, date);
          setPreview(calculations);
        } catch (error) {
          setPreview(null);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Filter out current goal from existing goals for duplicate check
    const otherGoals = existingGoals.filter(g => g.id !== goal.id);
    
    // Validate form
    const validation = validateGoalForm(
      formData.name,
      formData.targetAmount,
      formData.targetDate,
      otherGoals
    );

    if (!validation.isValid) {
      const fieldErrors: { [key: string]: string } = {};
      validation.errors.forEach(error => {
        if (error.includes('name')) fieldErrors.name = error;
        else if (error.includes('amount')) fieldErrors.targetAmount = error;
        else if (error.includes('date')) fieldErrors.targetDate = error;
        else fieldErrors.general = error;
      });
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return;
    }

    const amount = parseFloat(formData.targetAmount);
    
    try {
      const { weeklyTarget, monthlyTarget } = calculateSavingsTargets(amount, formData.targetDate);

      const updatedGoal: SavingsGoal = {
        ...goal,
        name: formData.name.trim(),
        targetAmount: amount,
        targetDate: formData.targetDate,
        weeklyTarget,
        monthlyTarget
      };

      onUpdateGoal(updatedGoal);
      onClose();
    } catch (error) {
      setErrors({ general: 'Failed to update goal. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-600" />
            Edit Goal
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{errors.general}</p>
            </div>
          )}

          <FormField label="Goal Name" error={errors.name} required>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Emergency Fund, New Car, Vacation"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                errors.name 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              required
              maxLength={50}
            />
          </FormField>

          <FormField label="Target Amount" error={errors.targetAmount} required>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="number"
                name="targetAmount"
                value={formData.targetAmount}
                onChange={handleInputChange}
                placeholder="5000"
                min="1"
                max="1000000"
                step="0.01"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                  errors.targetAmount 
                    ? 'border-red-300 focus:ring-red-500' 
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
                required
              />
            </div>
          </FormField>

          <FormField label="Target Date" error={errors.targetDate} required>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="date"
                name="targetDate"
                value={formData.targetDate}
                onChange={handleInputChange}
                min={minDate}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                  errors.targetDate 
                    ? 'border-red-300 focus:ring-red-500' 
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
                required
              />
            </div>
          </FormField>

          {preview && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-blue-900 mb-2">Updated Savings Plan</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-gray-600">Weekly Target</p>
                  <p className="font-bold text-blue-600">${preview.weeklyTarget}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-gray-600">Monthly Target</p>
                  <p className="font-bold text-green-600">${preview.monthlyTarget}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 text-center">
                {preview.daysLeft} days to reach your goal
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-4 py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};