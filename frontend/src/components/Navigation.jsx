import React from 'react';
import { Home, Target, TrendingUp, Settings, PiggyBank } from 'lucide-react';

/**
 * @typedef {Object} NavigationItem
 * @property {string} name - Display name for the navigation item
 * @property {string} path - Path identifier for the navigation item
 * @property {React.ComponentType} icon - Icon component for the navigation item
 */

/**
 * @typedef {Object} NavigationProps
 * @property {string} activeSection - Currently active section
 * @property {function} onSectionChange - Function to handle section changes
 */

/**
 * Main navigation component for the application
 * @param {NavigationProps} props
 */
export const Navigation = ({ activeSection, onSectionChange }) => {
  /** @type {NavigationItem[]} */
  const navigationItems = [
    { name: 'Dashboard', path: 'dashboard', icon: Home },
    { name: 'Saving Management', path: 'savings', icon: PiggyBank },
    { name: 'Goals Overview', path: 'goals', icon: Target },
    { name: 'Analytics', path: 'analytics', icon: TrendingUp },
    { name: 'Settings', path: 'settings', icon: Settings }
  ];

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <PiggyBank className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">MyBudgetPal</h1>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => onSectionChange(item.path)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                      activeSection === item.path
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            <select
              value={activeSection}
              onChange={(e) => onSectionChange(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {navigationItems.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </nav>
  );
};