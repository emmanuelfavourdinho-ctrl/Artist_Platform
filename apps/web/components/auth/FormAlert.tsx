interface FormAlertProps {
  message: string;
}

// role="alert" so screen readers announce this immediately.
export function FormAlert({ message }: FormAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      {message}
    </div>
  );
}
