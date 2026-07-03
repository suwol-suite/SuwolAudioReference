import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state-panel">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
