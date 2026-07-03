'use client';

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

// The one input style used everywhere (was duplicated as `const field = '…'`
// in Journal/Forecast/Settings and inline in a dozen other files).
export const fieldClass =
  'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${fieldClass} ${className}`} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`${fieldClass} ${className}`} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return <textarea ref={ref} className={`${fieldClass} ${className}`} {...props} />;
  }
);
