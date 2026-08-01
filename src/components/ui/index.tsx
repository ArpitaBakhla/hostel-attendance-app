import { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

export function GlassPanel({ children, className = '' }: GlassPanelProps) {
  return <div className={`glass-panel rounded-xl ${className}`}>{children}</div>;
}

interface GlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}

export function GlassButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: GlassButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`glass-button flex h-14 w-full items-center justify-center gap-2 rounded-full font-[family-name:var(--font-headline-md)] text-lg font-semibold text-white ${className}`}
    >
      {children}
    </button>
  );
}

interface StatusBadgeProps {
  status:
    | 'success'
    | 'failed'
    | 'manual_override'
    | 'on_leave'
    | 'absent'
    | 'pending'
    | 'approved'
    | 'rejected';
}

const statusConfig = {
  success: { label: 'Present', color: 'text-emerald bg-emerald/10 border-emerald/30' },
  failed: { label: 'Failed', color: 'text-error bg-error/10 border-error/30' },
  manual_override: {
    label: 'Manual Override',
    color: 'text-secondary bg-secondary/10 border-secondary/30',
  },
  on_leave: { label: 'On Leave', color: 'text-tertiary bg-tertiary/10 border-tertiary/30' },
  absent: { label: 'Absent', color: 'text-error bg-error/10 border-error/30' },
  pending: { label: 'Pending', color: 'text-on-surface-variant bg-white/5 border-white/10' },
  approved: { label: 'Approved', color: 'text-emerald bg-emerald/10 border-emerald/30' },
  rejected: { label: 'Rejected', color: 'text-error bg-error/10 border-error/30' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-[family-name:var(--font-label-sm)] text-xs font-semibold uppercase tracking-wider ${config.color}`}
    >
      {config.label}
    </span>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden pb-24 pt-safe text-on-surface selection:bg-primary/30 antialiased">
      {children}
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-[family-name:var(--font-label-md)] text-sm font-medium text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-lg px-4 py-3 font-[family-name:var(--font-body-md)] text-base ${props.className ?? ''}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 rounded-lg px-4 py-3 font-[family-name:var(--font-body-md)] text-base ${props.className ?? ''}`}
    />
  );
}

export function AlertBanner({
  type,
  message,
}: {
  type: 'success' | 'error' | 'info';
  message: string;
}) {
  const colors = {
    success: 'border-emerald/30 bg-emerald/10 text-emerald',
    error: 'border-error/30 bg-error/10 text-error',
    info: 'border-primary/30 bg-primary/10 text-primary',
  };

  return (
    <div className={`glass-panel rounded-xl border p-4 ${colors[type]}`}>
      <p className="font-[family-name:var(--font-body-md)] text-sm">{message}</p>
    </div>
  );
}
