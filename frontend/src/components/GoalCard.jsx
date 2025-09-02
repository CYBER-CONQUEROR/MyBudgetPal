import React from 'react';
import { Target, TrendingUp, Calendar, DollarSign, Edit, Trash2 } from 'lucide-react';
import { calculateProgress, formatCurrency, formatDate } from '../utils/calculations';

/**
 * @typedef {Object} GoalCardProps
 * @property {Object} goal - The savings goal object
 * @property {function} onClick - Function to handle card click
 * @property {function} onEdit - Function to handle edit action
 * @property {function} onDelete - Function to handle delete action
 */

/**
 * Card component displaying savings goal information
 * @param {GoalCardProps} props
 */
export const GoalCard = ({ goal, onClick, onEdit, onDelete }) => {
  const progress = calculateProgress(goal);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{goal.name}</h3>
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Target: {formatDate(goal.targetDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Edit goal"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Delete goal"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <div className={`p-2 rounded-lg ${progress.isComplete ? 'bg-green-100' : 'bg-blue-100'}`}>
              {progress.isComplete ? (
                <Target className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingUp className="h-6 w-6 text-blue-600" />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Progress</span>
            <span className={`text-sm font-semibold ${
              progress.isComplete ? 'text-green-600' : 'text-blue-600'
            }`}>
              {progress.progressPercentage.toFixed(1)}%
            </span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                progress.isComplete 
                  ? 'bg-gradient-to-r from-green-400 to-green-600' 
                  : 'bg-gradient-to-r from-blue-400 to-blue-600'
              }`}
              style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Current</p>
              <p className="font-bold text-lg text-gray-900">
                {formatCurrency(goal.currentAmount)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Target</p>
              <p className="font-bold text-lg text-gray-900">
                {formatCurrency(goal.targetAmount)}
              </p>
            </div>
          </div>

          {!progress.isComplete && (
            <div className="bg-gray-50 rounded-lg p-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Remaining</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(progress.remainingAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">Weekly target</span>
                <span className="text-sm font-medium text-blue-600">
                  {formatCurrency(goal.weeklyTarget)}
                </span>
              </div>
            </div>
          )}

          {progress.isComplete && (
            <div className="bg-green-50 rounded-lg p-3 mt-4 text-center">
              <p className="text-green-800 font-semibold">🎉 Goal Completed!</p>
            </div>
          )}

          {progress.isOverdue && !progress.isComplete && (
            <div className="bg-red-50 rounded-lg p-3 mt-4 text-center">
              <p className="text-red-800 font-semibold">⚠️ Goal Overdue</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};