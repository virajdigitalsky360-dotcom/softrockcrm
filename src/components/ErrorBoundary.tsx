import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Application error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center bg-[#07111a] px-4 text-center">
          <div className="max-w-md">
            <h1 className="mb-3 text-xl font-semibold text-white">Something went wrong</h1>
            <p className="mb-6 text-sm leading-6 text-gray-300">
              The app hit an unexpected error. Try reloading the page. If the problem persists, contact support.
            </p>
            <pre className="mb-6 max-h-40 overflow-auto rounded-lg border border-[#1b4052]/80 bg-[#091820]/70 p-4 text-left text-xs text-gray-400">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 text-sm font-semibold text-[#07111a] transition hover:opacity-90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
