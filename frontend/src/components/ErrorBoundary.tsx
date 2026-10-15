import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  failed: boolean;
}

// If a screen crashes, show this instead of a blank white page.
// The details go to the browser console for whoever fixes it, and are never shown to staff.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("A screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-leo-50 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="max-w-md text-gray-600">
          The page could not be shown. Reloading usually fixes it. If you were taking an order, it is still saved on this device.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-12 items-center rounded-xl bg-leo-600 px-6 text-base font-semibold text-white hover:bg-leo-700"
          >
            Reload page
          </button>
          <a
            href="/dashboard"
            className="inline-flex h-12 items-center rounded-xl border border-gray-300 bg-white px-6 text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
