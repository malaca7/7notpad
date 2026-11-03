import React, { useRef, useEffect } from 'react';

interface CodeInputProps {
  value: string; // 6 characters
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  value,
  onChange,
  disabled = false,
  autoFocus = true,
  error = false
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Array of 6 individual digits
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const digit = rawVal.replace(/\D/g, '').slice(-1); // Only keep the last numeric digit

    const newDigits = [...digits];
    newDigits[index] = digit;
    const newCombined = newDigits.join('').slice(0, 6);
    onChange(newCombined);

    // If a digit was entered, automatically focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // If current is empty, focus previous and clear it
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const targetIndex = Math.min(pasted.length, 5);
      inputRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 w-full max-w-sm mx-auto">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={el => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={e => handleChange(index, e)}
          onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-mono font-bold rounded-xl border-2 transition-all duration-200 outline-none
            ${error 
              ? 'border-red-500/80 bg-red-500/10 text-red-400 focus:ring-2 focus:ring-red-500/40' 
              : digit
                ? 'border-brand-500 bg-brand-500/10 text-brand-400 shadow-sm shadow-brand-500/20' 
                : 'border-slate-700 dark:border-slate-800 bg-slate-900/50 dark:bg-slate-950/60 text-slate-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text hover:border-slate-600'}
          `}
        />
      ))}
    </div>
  );
};

