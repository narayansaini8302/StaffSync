'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-lg w-full bg-slate-900 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-100 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            An unexpected error occurred while rendering this page. Try reloading
            or contact support if the problem persists.
          </p>
          {this.state.error && (
            <details className="text-left text-xs text-slate-500 mb-4 bg-slate-950 rounded-lg p-3">
              <summary className="cursor-pointer hover:text-slate-300">
                Show technical details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          >
            <RotateCw size={14} />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
