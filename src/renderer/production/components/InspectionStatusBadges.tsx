import React from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { ExecutionStatus, InspectionOutcome } from '../../types/api';

interface ExecutionStatusBadgeProps {
  status: ExecutionStatus | string;
  size?: 'sm' | 'md';
}

export const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const normalized = String(status || '').toUpperCase();
  const baseClass =
    size === 'md'
      ? 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold border'
      : 'inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border';

  switch (normalized) {
    case 'COMPLETED':
      return (
        <span
          className={`${baseClass} bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800`}
          title="Execution Status: COMPLETED (Pipeline finished executing without runtime errors)"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>COMPLETED</span>
        </span>
      );
    case 'RUNNING':
      return (
        <span
          className={`${baseClass} bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800`}
          title="Execution Status: RUNNING"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>RUNNING</span>
        </span>
      );
    case 'QUEUED':
      return (
        <span
          className={`${baseClass} bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800`}
          title="Execution Status: QUEUED"
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>QUEUED</span>
        </span>
      );
    case 'FAILED':
      return (
        <span
          className={`${baseClass} bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800`}
          title="Execution Status: FAILED (Runtime or node error occurred)"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>FAILED</span>
        </span>
      );
    case 'CANCELLED':
      return (
        <span
          className={`${baseClass} bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700`}
          title="Execution Status: CANCELLED"
        >
          <Ban className="w-3.5 h-3.5 shrink-0" />
          <span>CANCELLED</span>
        </span>
      );
    default:
      return (
        <span
          className={`${baseClass} bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700`}
        >
          <span>{normalized || 'IDLE'}</span>
        </span>
      );
  }
};

interface InspectionOutcomeBadgeProps {
  outcome: InspectionOutcome | string | null | undefined;
  executionStatus?: ExecutionStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

export const InspectionOutcomeBadge: React.FC<InspectionOutcomeBadgeProps> = ({
  outcome,
  executionStatus,
  size = 'sm',
}) => {
  const execNorm = String(executionStatus || '').toUpperCase();

  // Semantic Rule: A FAILED or CANCELLED execution must NEVER be displayed as OK,
  // nor as NG unless the Runtime explicitly reported an independent NG outcome.
  const normOutcome = outcome ? String(outcome).toUpperCase() : null;

  const sizeClass =
    size === 'lg'
      ? 'inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-bold tracking-wide border shadow-xs'
      : size === 'md'
      ? 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold border'
      : 'inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold border';

  if (execNorm === 'FAILED' && normOutcome !== 'NG') {
    return (
      <span
        className={`${sizeClass} bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700 font-mono`}
        title="No inspection verdict because pipeline execution failed"
      >
        <span>N/A (EXECUTION FAILED)</span>
      </span>
    );
  }

  if (normOutcome === 'OK') {
    return (
      <span
        className={`${sizeClass} bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700`}
        title="Inspection Outcome: OK (Part passed inspection criteria)"
      >
        <CheckCircle2 className={size === 'lg' ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        <span>OK</span>
      </span>
    );
  }

  if (normOutcome === 'NG') {
    return (
      <span
        className={`${sizeClass} bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700`}
        title="Inspection Outcome: NG (Part rejected by inspection criteria)"
      >
        <XCircle className={size === 'lg' ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        <span>NG</span>
      </span>
    );
  }

  if (normOutcome === 'UNKNOWN') {
    return (
      <span
        className={`${sizeClass} bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700`}
        title="Inspection Outcome: UNKNOWN (Pipeline completed without an explicit OK/NG decision node)"
      >
        <HelpCircle className={size === 'lg' ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        <span>UNKNOWN</span>
      </span>
    );
  }

  return (
    <span
      className={`${sizeClass} bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 font-mono`}
    >
      <span>—</span>
    </span>
  );
};
