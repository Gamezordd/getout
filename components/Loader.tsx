type Props = {
  title?: string;
  description?: string;
  className?: string;
};

export default function Loader({
  title = "Syncing...",
  description = "Pulling the latest group activity.",
  className = "",
}: Props) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm ${className}`.trim()}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-mist text-ink">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="h-5 w-5 animate-spin text-slate-500"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            className="opacity-20"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            className="opacity-90"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
      </div>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}
