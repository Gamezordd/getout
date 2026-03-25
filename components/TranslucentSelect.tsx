import type { ChangeEventHandler, SelectHTMLAttributes } from "react";

const VARIANT_CLASSES: Record<"light" | "dark", string> = {
  light:
    "border border-slate-200 bg-white/90 text-ink shadow-sm focus:border-slate-400 focus:outline-none",
  dark:
    "border border-white/10 bg-white/5 text-white focus:border-white/30 focus:outline-none",
};

type Option = {
  value: string | number;
  label: string;
};

type Props = {
  label: string;
  value: string | number;
  options: Option[];
  onChange: ChangeEventHandler<HTMLSelectElement>;
  variant?: "light" | "dark";
  selectName?: string;
  className?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export default function TranslucentSelect({
  label,
  value,
  options,
  onChange,
  variant = "light",
  selectName,
  className,
  ...props
}: Props) {
  const labelClass =
    variant === "dark" ? "text-base font-semibold text-white/80" : "text-base font-semibold text-ink";

  return (
    <div className="flex flex-col">
      <label className={labelClass}>
        {label}
      </label>
      <select
        name={selectName}
        value={value}
        onChange={onChange}
        className={`mt-2 w-full rounded-xl px-4 py-3 text-base ${VARIANT_CLASSES[variant]} ${className || ""}`}
        {...props}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
