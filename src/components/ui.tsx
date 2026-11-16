import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#e5ebf3] bg-white shadow-[0_8px_24px_rgba(31,56,88,0.05)] transition-all duration-200 ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-gray-500 ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner className="h-7 w-7 text-[#1478d4]" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-[#17243d]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[#5a6c84]">{hint}</p>}
    </div>
  );
}

export const statusStyles: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-600 border-slate-200',
  started: 'bg-amber-50 text-amber-700 border-amber-100',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-100',
  in_approval: 'bg-sky-50 text-sky-700 border-sky-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  not_approved: 'bg-rose-50 text-rose-700 border-rose-100',
};

export const statusLabel: Record<string, string> = {
  not_started: 'Not Started',
  started: 'Started',
  in_progress: 'In Progress',
  in_approval: 'In Approval',
  approved: 'Approved',
  not_approved: 'Not Approved',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 hover:shadow-md hover:shadow-current/20 ${statusStyles[status] ?? statusStyles.not_started}`}>
      {statusLabel[status] ?? status}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} rounded-2xl border border-[#e5ebf3] bg-white p-6 shadow-2xl`}>
        <h3 className="mb-4 text-lg font-semibold text-[#17243d]">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  const variants = {
    primary: 'bg-[#1478d4] text-white hover:bg-[#0f6dc3] hover:shadow-md hover:shadow-blue-500/20',
    ghost: 'text-[#5c6d86] hover:bg-[#eef5fc] hover:text-[#17243d]',
    danger: 'text-rose-600 hover:bg-rose-50 border border-rose-200',
    subtle: 'bg-[#f3f7fc] text-[#405572] hover:bg-[#e8f1fb] border border-[#dbe5f0]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-[#3d5070]">{label}</span>}
      <input
        {...props}
        className="w-full rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none transition-all duration-200 placeholder:text-[#5a6c84] focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

export function Textarea({ label, ...props }: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-[#3d5070]">{label}</span>}
      <textarea
        {...props}
        className="w-full rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none transition-all duration-200 placeholder:text-[#5a6c84] focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100 resize-y"
      />
    </label>
  );
}

export function Select({ label, children, ...props }: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-[#3d5070]">{label}</span>}
      <select
        {...props}
        className="w-full rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none transition-all duration-200 focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100 [&>option]:bg-white"
      >
        {children}
      </select>
    </label>
  );
}
