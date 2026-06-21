import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ScheduleErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ScheduleErrorBoundary] uncaught error:', error, info.componentStack);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        const title = this.props.fallbackTitle ?? 'เกิดข้อผิดพลาดในระบบตาราง';

        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-center">
                <AlertTriangle className="text-red-500 dark:text-red-400" size={40} />
                <div>
                    <p className="text-lg font-semibold text-red-700 dark:text-red-300">{title}</p>
                    <p className="text-sm text-red-500 dark:text-red-400 mt-1 max-w-md">
                        {this.state.error?.message ?? 'ข้อผิดพลาดที่ไม่รู้จัก'}
                    </p>
                </div>
                <button
                    onClick={this.handleReset}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors text-sm font-medium"
                >
                    <RefreshCw size={14} />
                    ลองใหม่
                </button>
            </div>
        );
    }
}
