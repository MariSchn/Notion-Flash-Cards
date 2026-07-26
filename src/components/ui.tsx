"use client";

import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

/** Notion's button: 3px radius, subtle shadow, tinted hover. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-[4px] font-medium whitespace-nowrap transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--nf-blue)]";
  const sizes = {
    sm: "h-7 px-2 text-[13px]",
    md: "h-8 px-3 text-[14px]",
  };
  const variants = {
    primary: "bg-[var(--nf-blue)] text-white hover:bg-[var(--nf-blue-hover)]",
    secondary:
      "bg-[var(--nf-bg)] text-[var(--nf-text)] shadow-[0_0_0_1px_var(--nf-border-strong)] hover:bg-[var(--nf-hover)]",
    ghost: "text-[var(--nf-text-secondary)] hover:bg-[var(--nf-hover)] hover:text-[var(--nf-text)]",
    danger: "text-[var(--nf-red)] hover:bg-[var(--nf-hover)]",
  };
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`h-8 w-full rounded-[4px] bg-[var(--nf-bg-secondary)] px-2.5 text-[14px] text-[var(--nf-text)] shadow-[inset_0_0_0_1px_var(--nf-border-strong)] outline-none transition-shadow placeholder:text-[var(--nf-text-tertiary)] focus:shadow-[inset_0_0_0_1px_var(--nf-blue),0_0_0_2px_rgba(35,131,226,0.2)] ${className}`}
        {...props}
      />
    );
  },
);

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "blue" | "green" | "gray";
}) {
  const tones = {
    default: "bg-[var(--nf-hover)] text-[var(--nf-text-secondary)]",
    blue: "nf-bg-blue nf-c-blue",
    green: "nf-bg-green nf-c-green",
    gray: "nf-bg-gray text-[var(--nf-text-secondary)]",
  };
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[12px] font-medium leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Callout({ children, tone = "red" }: { children: React.ReactNode; tone?: "red" | "gray" }) {
  return (
    <div
      className={`flex gap-2.5 rounded-[4px] p-3 text-[14px] ${
        tone === "red" ? "nf-bg-red nf-c-red" : "bg-[var(--nf-bg-secondary)] text-[var(--nf-text-secondary)]"
      }`}
    >
      <span aria-hidden className="shrink-0 leading-[1.4]">
        {tone === "red" ? "⚠️" : "💡"}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="text-[32px] leading-none" aria-hidden>
        {icon}
      </span>
      <p className="text-[15px] font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-[14px] text-[var(--nf-text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
