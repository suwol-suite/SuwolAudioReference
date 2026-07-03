import { AlertTriangle, FolderOpen, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../../i18n/useI18n";

interface ErrorBoundaryProps {
  children: ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  openLogsLabel: string;
  onOpenLogs: () => void;
  onError: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="error-boundary-fallback" role="alert">
        <div>
          <AlertTriangle size={24} aria-hidden="true" />
          <h1>{this.props.title}</h1>
          <p>{this.props.body}</p>
          <div className="inspector-action-row">
            <button className="primary-button compact" type="button" onClick={() => this.setState({ hasError: false })}>
              <RotateCcw size={15} aria-hidden="true" />
              {this.props.retryLabel}
            </button>
            <button className="secondary-button compact" type="button" onClick={this.props.onOpenLogs}>
              <FolderOpen size={15} aria-hidden="true" />
              {this.props.openLogsLabel}
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export function LocalizedErrorBoundary({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n();

  return (
    <ErrorBoundaryBase
      title={t("errorBoundary.title")}
      body={t("errorBoundary.body")}
      retryLabel={t("errorBoundary.retry")}
      openLogsLabel={t("diagnostics.openLogFolder")}
      onOpenLogs={() => {
        void window.suwolAudio.diagnostics.openLogFolder();
      }}
      onError={(error, info) => {
        void window.suwolAudio.diagnostics.logRendererError({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack ?? undefined,
        });
      }}
    >
      {children}
    </ErrorBoundaryBase>
  );
}
