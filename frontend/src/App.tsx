import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { SavingManagement } from './components/SavingManagement';
import { EditGoal } from './components/EditGoal';
import { DeleteConfirmation } from './components/DeleteConfirmation';
import { useLocalStorage } from './hooks/useLocalStorage';
import { SavingsGoal } from './types';

function App() {
  const [activeSection, setActiveSection] = useState('savings');
  const [goals, setGoals] = useLocalStorage<SavingsGoal[]>('savings-goals', []);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null);

  const handleUpdateGoal = (updatedGoal: SavingsGoal) => {
    setGoals(prev => prev.map(goal => 
      goal.id === updatedGoal.id ? updatedGoal : goal
    ));
    setEditingGoal(null);
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals(prev => prev.filter(goal => goal.id !== goalId));
    setDeletingGoal(null);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'savings':
        return <SavingManagement />;
      case 'dashboard':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to MyBudgetPal</h1>
              <p className="text-gray-600 mb-6">
                Your comprehensive financial management solution. Navigate to "Saving Management" 
                to start creating and tracking your savings goals.
              </p>
              <button
                onClick={() => setActiveSection('savings')}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Go to Savings
              </button>
            </div>
          </div>
        );
      case 'goals':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Goals Overview</h1>
              <p className="text-gray-600">
                This section will show detailed analytics and overview of all your goals.
                Currently, you can manage goals in the Saving Management section.
              </p>
            </div>
          </div>
        );
      case 'analytics':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Analytics</h1>
              <p className="text-gray-600">
                Advanced analytics and insights about your saving patterns will be available here.
              </p>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Settings</h1>
              <p className="text-gray-600">
                Configure your preferences, notifications, and account settings.
              </p>
            </div>
          </div>
        );
      default:
        return <SavingManagement />;
    }
  };

  const editingGoalData = editingGoal ? goals.find(g => g.id === editingGoal) : null;
  const deletingGoalData = deletingGoal ? goals.find(g => g.id === deletingGoal) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      <main className="pb-6">
        {renderContent()}
      </main>
      
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
}

export default App;