import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[QuickPick ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-dark-900 text-slate-100 p-6 select-none font-sans">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mb-4 shadow-xl">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-2">界面渲染遇到异常</h2>
          <p className="text-xs text-slate-400 max-w-md text-center mb-6 leading-relaxed">
            {this.state.error?.message || '发生了意外错误'}。您的选片数据全程安全保存在本地。
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReload}
              className="flex items-center space-x-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新加载工作台</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
