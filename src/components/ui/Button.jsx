import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Reusable Button component supporting primary, secondary, and outline styles.
 * If `to` prop is provided, renders a React Router Link styled as a button.
 */
export default function Button({
  children,
  to,
  onClick,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  id,
  type = 'button',
  disabled = false,
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-5 py-3 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow focus:ring-blue-500 border border-transparent',
    secondary:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 focus:ring-slate-400 border border-slate-200',
    outline:
      'bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 border border-slate-300 hover:border-slate-400 shadow-xs focus:ring-blue-500',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400',
  };

  const combinedStyles = `${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${variantStyles[variant] || variantStyles.primary} ${className}`;

  if (to) {
    return (
      <Link to={to} id={id} className={combinedStyles}>
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        <span>{children}</span>
      </Link>
    );
  }

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={combinedStyles}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span>{children}</span>
    </button>
  );
}
