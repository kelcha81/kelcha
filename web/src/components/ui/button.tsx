'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

// The app's button vocabulary as one component (replaces the inline Tailwind
// copies). Variants map 1:1 to the existing visual language — adopting Button
// must not change how anything looks.
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'rounded bg-blue-600 text-white hover:bg-blue-500',
  secondary: 'rounded border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700',
  danger: 'rounded bg-red-600 text-white hover:bg-red-500',
  ghost: 'rounded text-slate-400 hover:bg-slate-800 hover:text-white',
  icon: 'flex items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-white'
};

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  none: '' // icon buttons size themselves
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'xs', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${VARIANTS[variant]} ${SIZES[size]} font-medium disabled:opacity-40 ${className}`}
      {...props}
    />
  );
});
