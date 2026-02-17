import React from "react";

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string; // For additional styling on the inner dialog box
  overlayClassName?: string; // For additional styling on the overlay
  contentClassName?: string; // For additional styling on the content wrapper (flex items-center/end)
};

export default function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  className = "",
  overlayClassName = "",
  contentClassName = "items-center" // Default to center for most dialogs
}: DialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[11000] flex justify-center bg-black/40 px-4 ${overlayClassName}`}
      onClick={onClose} // This will close the dialog when clicking on the overlay
    >
      <div
        className={`w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl ${className} self-center ${contentClassName.includes("items-end") ? "self-end" : ""}`}
        onClick={(e) => e.stopPropagation()} // This will prevent clicks inside the dialog from closing it
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-ink">{title}</p>
            {description && <p className="mt-1 text-base text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
