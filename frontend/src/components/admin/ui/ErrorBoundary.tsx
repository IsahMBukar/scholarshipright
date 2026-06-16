'use client';

// React error boundary for admin pages.
// - Renders a friendly error card with the message and a "Try again" button.
// - Logs the error to console (real prod would also POST to a telemetry
//   endpoint, but we keep it simple for now).
// - "Try again" resets the boundary state so children re-render fresh.
//
// We expose two forms:
//   <ErrorBoundary> — default card UI
//   <PageErrorFallback> — just the fallback, in case a page wants to render
//     it inside its own layout.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import Button from './Button';

interface Props {
  children: ReactNode;
  /** Optional title for this boundary (e.g. "Overview") */
  label?: string;
  /** Optional fallback override. Defaults to PageErrorFallback. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep this in console — real apps would batch to telemetry.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? 'admin page', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <PageErrorFallback error={error} reset={this.reset} label={this.props.label} />;
  }
}

export function PageErrorFallback({
  error,
  reset,
  label,
}: {
  error: Error;
  reset: () => void;
  label?: string;
}) {
  return (
    <div className="bg-white rounded-card border border-red-200 p-8 max-w-2xl mx-auto mt-8">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {label ? `${label} failed to load` : 'Something went wrong'}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            An unexpected error occurred while rendering this view.
          </p>
          <pre className="mt-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {error.message}
          </pre>
          <div className="mt-4">
            <Button onClick={reset} leftIcon={<RotateCw className="w-3.5 h-3.5" />}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
