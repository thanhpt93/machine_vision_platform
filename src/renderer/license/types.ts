export type LicenseStatus =
  | 'NOT_ACTIVATED'
  | 'VALID'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'INVALID_PRODUCT'
  | 'EDITION_MISMATCH'
  | 'UNSUPPORTED_LICENSE';

export interface LicenseStatusResponse {
  status: LicenseStatus;
  is_valid: boolean;
  edition?: string | null;
  running_edition: string;
  license_number?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  product_id?: string | null;
  license_type?: 'SUBSCRIPTION' | 'PERPETUAL' | null;
  issued_at?: string | null;
  not_before?: string | null;
  expires_at?: string | null;
  features: string[];
  key_id?: string | null;
  signature_verified: boolean;
  message: string;
  error_code?: string | null;
}

export interface LicenseDetailsResponse {
  has_license: boolean;
  status: LicenseStatus;
  is_valid: boolean;
  edition?: string | null;
  running_edition: string;
  license_id?: string | null;
  license_number?: string | null;
  customer_id?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  product_id?: string | null;
  license_type?: 'SUBSCRIPTION' | 'PERPETUAL' | null;
  issued_at?: string | null;
  not_before?: string | null;
  expires_at?: string | null;
  features: string[];
  limits?: {
    max_devices: number;
    max_concurrent_inspections: number;
    total_inspection_quota: number;
  } | null;
  key_id?: string | null;
  key_fingerprint?: string | null;
  signature_algorithm?: string | null;
  signature_verified: boolean;
  persisted_path?: string | null;
  message: string;
}

export interface LicenseImportResponse {
  success: boolean;
  status: LicenseStatus;
  license_number?: string | null;
  message: string;
  details?: LicenseStatusResponse | null;
}

export interface LicenseValidateResponse {
  valid: boolean;
  status: LicenseStatus;
  reason: string;
  license_number?: string | null;
  edition?: string | null;
  product_id?: string | null;
  key_id?: string | null;
  expires_at?: string | null;
  features: string[];
}
