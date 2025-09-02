import React from 'react';

/**
 * @typedef {Object} FormFieldProps
 * @property {string} label - The label for the form field
 * @property {string} [error] - Error message to display
 * @property {React.ReactNode} children - The form input element
 * @property {boolean} [required=false] - Whether the field is required
 */

/**
 * Reusable form field component with label and error handling
 * @param {FormFieldProps} props
 */
export const FormField = ({ 
  label, 
  error, 
  children, 
  required = false 
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center text-xs">!</span>
          {error}
        </p>
      )}
    </div>
  );
};