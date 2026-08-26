interface AuthSubmitButtonProps {
  submitting: boolean;
  label: string;
  submittingLabel: string;
}

export function AuthSubmitButton({ submitting, label, submittingLabel }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-sm font-medium tracking-wide text-accent-foreground transition-all duration-300 ease-cinematic hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitting ? submittingLabel : label}
      {!submitting && (
        <span
          aria-hidden="true"
          className="transition-transform duration-300 ease-cinematic group-hover:translate-x-1"
        >
          →
        </span>
      )}
    </button>
  );
}
