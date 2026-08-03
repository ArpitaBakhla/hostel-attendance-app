import { type ChangeEvent } from 'react';


interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, className, disabled }: PhoneInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Always ensure it starts with +91
    if (!val.startsWith('+91')) {
      // If user is deleting +91, just keep it
      if (val === '+9' || val === '+' || val === '') {
        onChange('+91');
        return;
      }
      
      // If they pasted something without +91, add it (and clean it)
      const cleaned = val.replace(/\D/g, ''); // keep only digits
      
      // If they pasted '919999999999' by mistake
      if (cleaned.startsWith('91') && cleaned.length > 2) {
        onChange(`+${cleaned}`);
      } else {
        onChange(`+91${cleaned}`);
      }
      return;
    }

    // Clean up multiple +91s or extra spaces
    // Only allow digits after +91
    const prefix = '+91';
    let suffix = val.substring(3).replace(/\D/g, '');
    
    // Prevent them from typing 91 again right after +91 (e.g. +91919999999999) if they copy-pasted
    // Wait, some numbers might actually start with 91... so we can't blindly strip it, 
    // but we can strip if it matches exactly a copy paste like +91+919999999999
    val = val.replace(/\+91\+91/g, '+91');
    suffix = val.substring(3).replace(/\D/g, '');

    // Limit to 10 digits after +91
    if (suffix.length > 10) {
      suffix = suffix.substring(0, 10);
    }

    onChange(`${prefix}${suffix}`);
  };

  return (
    <input
      type="tel"
      inputMode="tel"
      placeholder="+91 XXXXX XXXXX"
      value={value}
      onChange={handleChange}
      className={`rounded-lg px-4 py-3 font-[family-name:var(--font-body-md)] text-base ${className ?? ''}`}
      disabled={disabled}
      maxLength={13} // +91 + 10 digits
    />
  );
}
