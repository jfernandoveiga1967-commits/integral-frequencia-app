import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Caught by ErrorBoundary:', error?.message);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl p-8 shadow-xl border border-slate-200 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-900">
                Ocorreu uma instabilidade inesperada
              </h2>
              <p className="text-sm text-slate-600">
                O sistema isolou o erro para proteger seus dados. Você pode tentar reiniciar a visualização ou recarregar o sistema.
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs font-mono text-slate-700 max-h-32 overflow-y-auto">
                <p className="font-bold text-rose-700 mb-1">{this.state.error.name}: {this.state.error.message}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Home className="w-4 h-4" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-indigo-600/20 cursor-pointer flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recarregar Página</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
