import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Cpu,
  Layers,
  RefreshCw,
  Shield,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useLicenseStore } from '../store/licenseStore';

export const LicenseDetailsModal: React.FC = () => {
  const showDetailsModal = useLicenseStore((s) => s.showDetailsModal);
  const closeDetailsModal = useLicenseStore((s) => s.closeDetailsModal);
  const openActivationModal = useLicenseStore((s) => s.openActivationModal);
  const licenseDetails = useLicenseStore((s) => s.licenseDetails);

  if (!showDetailsModal) return null;

  const det = licenseDetails;
  const isPerpetual = det?.license_type === 'PERPETUAL';

  const handleOpenReplace = () => {
    closeDetailsModal();
    openActivationModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      data-testid="license-details-modal"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Active License Entitlements & Signature Details
              </h3>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {det?.license_number || 'NVL-ACTIVE'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeDetailsModal}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* Status & Identity Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 uppercase">
                {det?.status || 'VALID'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Edition</div>
              <div className="font-bold text-slate-800 dark:text-slate-200 mt-1 capitalize">
                {det?.edition || 'Developer'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Type</div>
              <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                {det?.license_type || 'SUBSCRIPTION'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Product</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-1">
                {det?.product_id || 'NOVA-MVP'}
              </div>
            </div>
          </div>

          {/* Customer & License Info */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
              <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Customer Assignment</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Company Name: </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {det?.customer_name || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Customer Code: </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {det?.customer_code || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">License ID: </span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {det?.license_id || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Dates & Validity Interval */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Validity & Expiration Timeline</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Issued At: </span>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                  {det?.issued_at || 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Valid From: </span>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                  {det?.not_before || 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Expires At: </span>
                <div className="font-mono font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {isPerpetual ? 'Never (Perpetual Entitlement)' : det?.expires_at || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Concurrency & Device Limits */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
              <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Capacity & Hardware Constraints</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Max Devices:</span>
                <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {det?.limits?.max_devices === -1
                    ? 'Unlimited'
                    : det?.limits?.max_devices ?? '1'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Max Concurrent:</span>
                <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {det?.limits?.max_concurrent_inspections === -1
                    ? 'Unlimited'
                    : det?.limits?.max_concurrent_inspections ?? '1'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Total Quota:</span>
                <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {det?.limits?.total_inspection_quota === -1
                    ? 'Unlimited'
                    : det?.limits?.total_inspection_quota ?? 'Unlimited'}
                </div>
              </div>
            </div>
          </div>

          {/* Features Granted */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Feature Entitlements</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {det?.features && det.features.length > 0 ? (
                det.features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-mono text-[10px]"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5 text-blue-500" />
                    <span>{f === '*' ? 'Full Platform Capabilities (*)' : f}</span>
                  </span>
                ))
              ) : (
                <span className="text-slate-400 text-[11px]">Standard Edition Features</span>
              )}
            </div>
          </div>

          {/* Cryptography & Key ID */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
              <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Cryptographic Verification & Trust</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div>
                <span className="text-slate-400">Signing Key ID: </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {det?.key_id || 'nova-key-2026-01'}
                </span>
              </div>
              {det?.key_fingerprint && (
                <div>
                  <span className="text-slate-400">Public Key SHA-256 Fingerprint: </span>
                  <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all select-all">
                    {det.key_fingerprint}
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold">
                  Algorithm: {det?.signature_algorithm || 'Ed25519'} • RFC 8785 Canonical Verified
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 shrink-0">
          <button
            type="button"
            onClick={handleOpenReplace}
            data-testid="replace-license-btn"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Replace / Renew License...</span>
          </button>

          <button
            type="button"
            onClick={closeDetailsModal}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
