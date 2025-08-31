export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateGoalName = (name: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!name.trim()) {
    errors.push('Goal name is required');
  } else if (name.trim().length < 2) {
    errors.push('Goal name must be at least 2 characters long');
  } else if (name.trim().length > 50) {
    errors.push('Goal name must be less than 50 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateTargetAmount = (amount: string): ValidationResult => {
  const errors: string[] = [];
  const numAmount = parseFloat(amount);
  
  if (!amount.trim()) {
    errors.push('Target amount is required');
  } else if (isNaN(numAmount)) {
    errors.push('Target amount must be a valid number');
  } else if (numAmount <= 0) {
    errors.push('Target amount must be greater than 0');
  } else if (numAmount > 1000000) {
    errors.push('Target amount cannot exceed $1,000,000');
  } else if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    errors.push('Target amount can have at most 2 decimal places');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateTargetDate = (date: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!date.trim()) {
    errors.push('Target date is required');
  } else {
    const targetDate = new Date(date);
    const today = new Date();
    const minDate = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const maxDate = new Date(today.getTime() + 10 * 365 * 24 * 60 * 60 * 1000); // 10 years from now
    
    if (isNaN(targetDate.getTime())) {
      errors.push('Target date must be a valid date');
    } else if (targetDate < minDate) {
      errors.push('Target date must be at least tomorrow');
    } else if (targetDate > maxDate) {
      errors.push('Target date cannot be more than 10 years in the future');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateDepositAmount = (amount: string, goalRemaining: number): ValidationResult => {
  const errors: string[] = [];
  const numAmount = parseFloat(amount);
  
  if (!amount.trim()) {
    errors.push('Deposit amount is required');
  } else if (isNaN(numAmount)) {
    errors.push('Deposit amount must be a valid number');
  } else if (numAmount <= 0) {
    errors.push('Deposit amount must be greater than 0');
  } else if (numAmount > 100000) {
    errors.push('Single deposit cannot exceed $100,000');
  } else if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    errors.push('Deposit amount can have at most 2 decimal places');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateDepositNote = (note: string): ValidationResult => {
  const errors: string[] = [];
  
  if (note.length > 100) {
    errors.push('Note must be less than 100 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateGoalForm = (name: string, amount: string, date: string, existingGoals: { name: string }[] = []): ValidationResult => {
  const nameValidation = validateGoalName(name);
  const amountValidation = validateTargetAmount(amount);
  const dateValidation = validateTargetDate(date);
  
  const errors = [
    ...nameValidation.errors,
    ...amountValidation.errors,
    ...dateValidation.errors
  ];
  
  // Check for duplicate goal names
  const trimmedName = name.trim().toLowerCase();
  const isDuplicate = existingGoals.some(goal => 
    goal.name.toLowerCase() === trimmedName
  );
  
  if (isDuplicate) {
    errors.push('A goal with this name already exists');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};