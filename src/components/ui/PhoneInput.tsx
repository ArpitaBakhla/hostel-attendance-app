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
      if (val === '+9' || val === '+' || val === '') {
        onChange('+91');
        return;
      }
      
      const cleaned = val.replace(/\D/g, ''); 
      if (cleaned.startsWith('91')) {
        onChange(`+${cleaned.substring(0, 12)}`);
      } else {
        onChange(`+91${cleaned.substring(0, 10)}`);
      }
      return;
    }

    const suffix = val.substring(3).replace(/\D/g, '').substring(0, 10);
    onChange(`+91${suffix}`);
  };

  return (
    <input
      type="tel"
      inputMode="tel"
      placeholder="+91 XXXXX XXXXX"
      value={value || '+91'}
      onChange={handleChange}
      className={`rounded-lg px-4 py-3 font-[family-name:var(--font-body-md)] text-base ${className ?? ''}`}
      disabled={disabled}
      maxLength={13} 
    />
  );
}
