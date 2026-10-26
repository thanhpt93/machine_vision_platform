import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FolderOpen,
  KeyRound,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useLicenseStore } from '../store/licenseStore';

export const LicenseActivationModal: React.FC = () => {
  const showActivationModal = useLicenseStore((s) => s.showActivationModal);
  const closeActivationModal = useLicenseStore((s) => s.closeActivationModal);
  const licenseStatus = useLicenseStore((s) => s.licenseStatus);
  const isActivating = useLicenseStore((s) => s.isActivating);
  const storeError = useLicenseStore((s) => s.error);
  const setError = useLicenseStore((s) => s.setError);
  const importLicenseFromContent = useLicenseStore((s) => s.importLicenseFromContent);

  const [confirmReplace, setConfirmReplace] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!showActivationModal) return null;

  const runningEdition = licenseStatus?.running_edition || 'developer';
  const hasValidLicense = licenseStatus?.is_valid === true;

  const handleSelectAndImport = async () => {
    setError(null);
    setSuccessMessage(null);

    if (typeof window === 'undefined' || !window.electronAPI?.selectLicenseFile) {
      setError('Native Electron file picker is unavailable in this environment.');
      return;
    }

    try {
      const result = await window.electronAPI.selectLicenseFile();
      if (result.canceled) return;
      if (!result.success || !result.content) {
        setError(result.error || 'Failed to read selected license file.');
        return;
      }

      const res = await importLicenseFromContent(result.content);
      if (res.success) {
        setSuccessMessage(res.message);
        setConfirmReplace(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setConfirmReplace(false);
    closeActivationModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      data-testid="license-activation-modal"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-xs">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                NOVA License Activation
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Target Edition:{' '}
                <span className="font-semibold text-blue-600 dark:text-blue-400 capitalize">
                  {runningEdition} Edition
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Success Banner */}
          {successMessage && (
            <div
              className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-start space-x-2.5"
              data-testid="license-import-success"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Activation Successful</div>
                <div className="text-[11px] mt-0.5">{successMessage}</div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {storeError && (
            <div
              className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-start space-x-2.5"
              data-testid="license-import-error"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Activation Failed</div>
                <div className="text-[11px] mt-0.5">{storeError}</div>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!successMessage && (
            <div className="space-y-3">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Import a digitally signed license artifact issued by{' '}
                <strong>NOVA License Management</strong>. Supported artifact extensions include{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                  .novalic.json
                </code>
                ,{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                  .lic
                </code>
                , or{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                  .json
                </code>
                .
              </p>

              {/* Existing License Warning & Replacement Confirmation */}
              {hasValidLicense && !confirmReplace ? (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="flex items-center space-x-2 font-semibold">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Active License Already Installed</span>
                  </div>
                  <p className="text-[11px] leading-normal">
                    License <strong>{licenseStatus?.license_number}</strong> is currently active for{' '}
                    {licenseStatus?.customer_name}. Importing a new file will safely validate and
                    replace it.
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmReplace(true)}
                    className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors shadow-xs"
                  >
                    Confirm & Select Replacement License
                  </button>
                </div>
              ) : (
                <div className="p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center space-y-2.5 bg-slate-50/50 dark:bg-slate-950/20">
                  <div className="mx-auto w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Select Signed License Artifact
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cryptographically verified against the trusted NOVA Ed25519 public key.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAndImport}
                    disabled={isActivating}
                    data-testid="select-license-file-btn"
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold shadow-xs transition-colors"
                  >
                    {isActivating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying & Persisting...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck2 className="w-4 h-4" />
                        <span>Select License File...</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold transition-colors text-xs"
          >
            {successMessage ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
