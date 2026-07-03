interface ProgressDialogProps {
  open: boolean;
  title: string;
  message?: string;
}

export function ProgressDialog({ open, title, message }: ProgressDialogProps): JSX.Element | null {
  if (!open) {
    return null;
  }
  return (
    <div className="progress-overlay" role="presentation">
      <section className="progress-dialog" role="status" aria-live="polite" aria-label={title}>
        <span className="spinner" aria-hidden="true" />
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
      </section>
    </div>
  );
}
