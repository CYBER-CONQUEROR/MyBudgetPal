import React from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/calculations';

/**
 * @typedef {Object} DeleteConfirmationProps
 * @property {Object} goal - The goal to delete
 * @property {function} onConfirm - Function to confirm deletion
 * @property {function} onCancel - Function to cancel deletion
 */

/**
 * Modal component for confirming goal deletion
 * @param {DeleteConfirmationProps} props
 */
export const DeleteConfirmation = ({ 
  goal, 
  onConfirm, 
  onCancel 
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            Delete Goal
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this savings goal? This action cannot be undone.
            </p>
            
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <h3 className="font-semibold text-red-900 mb-2">{goal.name}</h3>
              <div className="text-sm text-red-700 space-y-1">
                <p>Target Amount: {formatCurrency(goal.targetAmount)}</p>
                <p>Current Savings: {formatCurrency(goal.currentAmount)}</p>
                <p>Total Deposits: {goal.deposits.length}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};