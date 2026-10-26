import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useLicenseStore } from '../store/licenseStore';

interface LicenseStatusBadgeProps {
  className?: string;
}

export const LicenseStatusBadge: React.FC<LicenseStatusBadgeProps> = ({ className = '' }) => {
  const licenseStatus = useLicenseStore((s) => s.licenseStatus);
  const openDetailsModal = useLicenseStore((s) => s.openDetailsModal);
  const openActivationModal = useLicenseStore((s) => s.openActivationModal);

  const status = licenseStatus?.status || 'NOT_ACTIVATED';
  const isValid = licenseStatus?.is_valid === true;

  const handleClick = () => {
    if (isValid) {
      openDetailsModal();
    } else {
      openActivationModal();
    }
  };

  if (isValid) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid="license-badge-valid"
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800 transition-colors shadow-xs ${className}`}
        title={`Active License: ${licenseStatus?.license_number || 'Valid'}. Click to view details.`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="truncate max-w-[140px]">
          {licenseStatus?.license_number || 'License Valid'}
        </span>
      </button>
    );
  }

  if (status === 'EXPIRED') {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid="license-badge-expired"
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-800 transition-colors shadow-xs animate-pulse ${className}`}
        title="License has expired. Click to import renewal license."
      >
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>License Expired</span>
      </button>
    );
  }

  if (status === 'EDITION_MISMATCH') {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid="license-badge-mismatch"
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800 transition-colors shadow-xs ${className}`}
        title="License edition does not match this installation. Click to resolve."
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Edition Mismatch</span>
      </button>
    );
  }

  if (status === 'INVALID_SIGNATURE' || status === 'INVALID_PRODUCT') {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid="license-badge-invalid"
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-800 transition-colors shadow-xs ${className}`}
        title="Invalid license signature or product. Click to import valid license."
      >
        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Invalid License</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="license-badge-not-activated"
      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800 transition-colors shadow-xs ${className}`}
      title="Application is not activated. Click to import license."
    >
      <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>Not Activated</span>
    </button>
  );
};
