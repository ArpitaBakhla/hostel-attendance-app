import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertBanner, GlassButton, PageShell } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] Unhandled render error.', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <PageShell>
        <main className="flex flex-grow flex-col items-center justify-center gap-6 px-6">
          <div className="w-full max-w-md">
            <AlertBanner type="error" message={getErrorMessage(error)} />
          </div>
          <div className="w-full max-w-md">
            <GlassButton onClick={() => window.location.reload()}>Reload app</GlassButton>
          </div>
        </main>
      </PageShell>
    );
  }
}
