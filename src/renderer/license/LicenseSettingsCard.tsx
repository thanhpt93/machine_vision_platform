import React from 'react';
import {
  FileCheck2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useLicenseStore } from '../store/licenseStore';

export const LicenseSettingsCard: React.FC = () => {
  const licenseStatus = useLicenseStore((s) => s.licenseStatus);
  const openActivationModal = useLicenseStore((s) => s.openActivationModal);
  const openDetailsModal = useLicenseStore((s) => s.openDetailsModal);

  const status = licenseStatus?.status || 'NOT_ACTIVATED';
  const isValid = licenseStatus?.is_valid === true;

  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs space-y-4"
      data-testid="license-settings-card"
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Software License & Activation
          </h3>
        </div>
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            isValid
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          {isValid ? (
            <>
              <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>ACTIVATED</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>{status}</span>
            </>
          )}
        </span>
      </div>

      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400">License Number</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white mt-1">
              {licenseStatus?.license_number || 'No license active'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Customer: {licenseStatus?.customer_name || 'Unassigned'}
            </div>
          </div>

          <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400">Licensed Edition</div>
            <div className="font-bold text-slate-900 dark:text-white mt-1 capitalize">
              {licenseStatus?.edition || 'Unlicensed'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {licenseStatus?.license_type === 'PERPETUAL'
                ? 'Perpetual Entitlement'
                : `Expires: ${licenseStatus?.expires_at ? new Date(licenseStatus.expires_at).toLocaleDateString() : 'N/A'}`}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {licenseStatus?.message ||
            'Import a signed license artifact from NOVA License Management to activate capabilities.'}
        </p>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {isValid ? (
            <>
              <button
                type="button"
                onClick={openDetailsModal}
                data-testid="view-license-details-btn"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors shadow-xs"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>View Full Details</span>
              </button>

              <button
                type="button"
                onClick={openActivationModal}
                data-testid="replace-license-btn"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Replace License</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openActivationModal}
              data-testid="import-license-btn"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Import & Activate License...</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
