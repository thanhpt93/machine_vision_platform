import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LicenseStatusBadge } from '../LicenseStatusBadge';
import { LicenseActivationModal } from '../LicenseActivationModal';
import { LicenseDetailsModal } from '../LicenseDetailsModal';
import { LicenseSettingsCard } from '../LicenseSettingsCard';
import { useLicenseStore } from '../../store/licenseStore';
import { runtimeApi } from '../../services/runtimeApi';
import { LicenseDetailsResponse, LicenseImportResponse, LicenseStatusResponse } from '../types';

describe('License UI & State Management Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    window.electronAPI = {
      getAppInfo: vi.fn(),
      getRuntimeDefaultUrl: vi.fn(() => 'http://127.0.0.1:8000'),
      savePipelineFile: vi.fn(),
      openPipelineFile: vi.fn(),
      selectImageFile: vi.fn(),
      selectLicenseFile: vi.fn().mockResolvedValue({
        success: true,
        filePath: 'C:/licenses/sample.novalic.json',
        content: JSON.stringify({
          artifact_format: 'NOVA-LICENSE-ENVELOPE-V1',
          key_id: 'nova-key-2026-01',
          algorithm: 'Ed25519',
          payload: {
            license_id: 'lic-1234',
            license_number: 'NVL-2026-TEST',
            customer_name: 'Acme Robotics',
            product_id: 'NOVA-MV-PROD',
            edition: 'production',
            features: ['runtime_execution', 'recipe_management'],
            license_type: 'SUBSCRIPTION',
            not_before: '2026-01-01T00:00:00Z',
            not_after: '2027-01-01T00:00:00Z',
          },
          signature: 'dummy_sig',
        }),
      }),
      onMenuAction: vi.fn(() => () => {}),
    };

    useLicenseStore.setState({
      licenseStatus: {
        status: 'NOT_ACTIVATED',
        is_valid: false,
        running_edition: 'production',
        edition: null,
        license_number: null,
        customer_name: null,
        not_before: null,
        expires_at: null,
        features: [],
        signature_verified: false,
        message: 'No license installed.',
      },
      licenseDetails: null,
      isLoading: false,
      isActivating: false,
      error: null,
      showActivationModal: false,
      showDetailsModal: false,
    });
  });

  describe('LicenseStatusBadge', () => {
    it('renders "Not Activated" badge when NOT_ACTIVATED and opens activation modal on click', () => {
      render(<LicenseStatusBadge />);

      const badge = screen.getByTestId('license-badge-not-activated');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Not Activated');

      fireEvent.click(badge);
      expect(useLicenseStore.getState().showActivationModal).toBe(true);
    });

    it('renders valid badge with license number when VALID and opens details modal on click', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'VALID',
          is_valid: true,
          running_edition: 'production',
          edition: 'production',
          license_number: 'NVL-2026-OK',
          customer_name: 'Factory One',
          not_before: '2026-01-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
          features: ['runtime_execution'],
          signature_verified: true,
          message: 'License is valid and active.',
        },
      });

      render(<LicenseStatusBadge />);

      const badge = screen.getByTestId('license-badge-valid');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('NVL-2026-OK');

      fireEvent.click(badge);
      expect(useLicenseStore.getState().showDetailsModal).toBe(true);
    });

    it('renders expired badge when status is EXPIRED', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'EXPIRED',
          is_valid: false,
          running_edition: 'production',
          edition: 'production',
          license_number: 'NVL-2025-OLD',
          customer_name: 'Factory One',
          not_before: '2025-01-01T00:00:00Z',
          expires_at: '2026-01-01T00:00:00Z',
          features: [],
          signature_verified: true,
          message: 'License expired on 2026-01-01.',
        },
      });

      render(<LicenseStatusBadge />);

      const badge = screen.getByTestId('license-badge-expired');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('License Expired');
    });

    it('renders edition mismatch badge when status is EDITION_MISMATCH', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'EDITION_MISMATCH',
          is_valid: false,
          running_edition: 'production',
          edition: 'developer',
          license_number: 'NVL-DEV-ONLY',
          customer_name: 'Dev Lab',
          not_before: '2026-01-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
          features: [],
          signature_verified: true,
          message: 'License is for developer edition, but running edition is production.',
        },
      });

      render(<LicenseStatusBadge />);

      const badge = screen.getByTestId('license-badge-mismatch');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Edition Mismatch');
    });

    it('renders invalid license badge when status is INVALID_SIGNATURE', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'INVALID_SIGNATURE',
          is_valid: false,
          running_edition: 'production',
          edition: null,
          license_number: null,
          customer_name: null,
          not_before: null,
          expires_at: null,
          features: [],
          signature_verified: false,
          message: 'Digital signature verification failed.',
        },
      });

      render(<LicenseStatusBadge />);

      const badge = screen.getByTestId('license-badge-invalid');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Invalid License');
    });
  });

  describe('LicenseActivationModal', () => {
    it('does not render when showActivationModal is false', () => {
      useLicenseStore.setState({ showActivationModal: false });
      const { container } = render(<LicenseActivationModal />);
      expect(container.firstChild).toBeNull();
    });

    it('renders modal and imports selected license file successfully', async () => {
      const mockStatus: LicenseStatusResponse = {
        status: 'VALID',
        is_valid: true,
        running_edition: 'production',
        edition: 'production',
        license_number: 'NVL-2026-TEST',
        customer_name: 'Acme Robotics',
        not_before: '2026-01-01T00:00:00Z',
        expires_at: '2027-01-01T00:00:00Z',
        features: ['runtime_execution', 'recipe_management'],
        signature_verified: true,
        message: 'License imported and verified successfully.',
      };

      const mockImportRes: LicenseImportResponse = {
        success: true,
        status: 'VALID',
        license_number: 'NVL-2026-TEST',
        message: 'License imported and verified successfully.',
        details: mockStatus,
      };

      vi.spyOn(runtimeApi, 'importLicense').mockResolvedValue(mockImportRes);
      vi.spyOn(runtimeApi, 'getLicenseStatus').mockResolvedValue(mockStatus);

      useLicenseStore.setState({ showActivationModal: true });
      render(<LicenseActivationModal />);

      expect(screen.getByTestId('license-activation-modal')).toBeInTheDocument();
      expect(screen.getByText('NOVA License Activation')).toBeInTheDocument();

      const selectBtn = screen.getByTestId('select-license-file-btn');
      await act(async () => {
        fireEvent.click(selectBtn);
      });

      await waitFor(() => {
        expect(window.electronAPI?.selectLicenseFile).toHaveBeenCalled();
        expect(runtimeApi.importLicense).toHaveBeenCalled();
      });

      expect(useLicenseStore.getState().licenseStatus?.is_valid).toBe(true);
      expect(useLicenseStore.getState().licenseStatus?.license_number).toBe('NVL-2026-TEST');
    });

    it('shows confirmation replace prompt when a valid license is already active', () => {
      useLicenseStore.setState({
        showActivationModal: true,
        licenseStatus: {
          status: 'VALID',
          is_valid: true,
          running_edition: 'production',
          edition: 'production',
          license_number: 'NVL-CURRENT-ACTIVE',
          customer_name: 'Existing Customer',
          not_before: '2026-01-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
          features: ['runtime_execution'],
          signature_verified: true,
          message: 'Active license.',
        },
      });

      render(<LicenseActivationModal />);

      expect(screen.getByText('Active License Already Installed')).toBeInTheDocument();
      expect(screen.getByText(/NVL-CURRENT-ACTIVE/)).toBeInTheDocument();
      expect(screen.getByText('Confirm & Select Replacement License')).toBeInTheDocument();
    });
  });

  describe('LicenseDetailsModal', () => {
    it('renders complete license details, customer, validity dates, features, and key ID', () => {
      const mockDetails: LicenseDetailsResponse = {
        has_license: true,
        license_id: 'lic-det-001',
        license_number: 'NVL-2026-PROD-FULL',
        customer_name: 'Global Auto Components',
        customer_code: 'GAC-001',
        product_id: 'NOVA-MV-PROD',
        edition: 'production',
        features: ['runtime_execution', 'recipe_management', 'plc_communication'],
        license_type: 'SUBSCRIPTION',
        not_before: '2026-01-01T00:00:00Z',
        expires_at: '2027-01-01T00:00:00Z',
        limits: {
          max_devices: 4,
          max_concurrent_inspections: 2,
          total_inspection_quota: 100000,
        },
        key_id: 'nova-key-2026-01',
        signature_algorithm: 'Ed25519',
        signature_verified: true,
        running_edition: 'production',
        is_valid: true,
        status: 'VALID',
        message: 'Active production license.',
      };

      useLicenseStore.setState({
        showDetailsModal: true,
        licenseDetails: mockDetails,
      });

      render(<LicenseDetailsModal />);

      expect(screen.getByTestId('license-details-modal')).toBeInTheDocument();
      expect(screen.getByText('Global Auto Components')).toBeInTheDocument();
      expect(screen.getByText('NVL-2026-PROD-FULL')).toBeInTheDocument();
      expect(screen.getByText('runtime_execution')).toBeInTheDocument();
      expect(screen.getByText('plc_communication')).toBeInTheDocument();
      expect(screen.getByText('nova-key-2026-01')).toBeInTheDocument();
      expect(screen.getByText(/Ed25519/)).toBeInTheDocument();

      // Click "Replace License" closes details and opens activation modal
      const replaceBtn = screen.getByRole('button', { name: /Replace \/ Renew License/i });
      fireEvent.click(replaceBtn);

      expect(useLicenseStore.getState().showDetailsModal).toBe(false);
      expect(useLicenseStore.getState().showActivationModal).toBe(true);
    });
  });

  describe('LicenseSettingsCard', () => {
    it('renders inside settings page with activation button when unactivated', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'NOT_ACTIVATED',
          is_valid: false,
          running_edition: 'production',
          edition: null,
          license_number: null,
          customer_name: null,
          not_before: null,
          expires_at: null,
          features: [],
          signature_verified: false,
          message: 'No license installed.',
        },
      });

      render(<LicenseSettingsCard />);

      expect(screen.getByTestId('license-settings-card')).toBeInTheDocument();
      expect(screen.getByText('Software License & Activation')).toBeInTheDocument();
      expect(screen.getByText('NOT_ACTIVATED')).toBeInTheDocument();
      expect(screen.getByText('Import & Activate License...')).toBeInTheDocument();
    });

    it('renders active details and view details button when valid license is installed', () => {
      useLicenseStore.setState({
        licenseStatus: {
          status: 'VALID',
          is_valid: true,
          running_edition: 'production',
          edition: 'production',
          license_number: 'NVL-2026-PROD',
          customer_name: 'Nova Manufacturing Inc.',
          not_before: '2026-01-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
          features: ['runtime_execution'],
          signature_verified: true,
          message: 'Valid.',
        },
      });

      render(<LicenseSettingsCard />);

      expect(screen.getByText('NVL-2026-PROD')).toBeInTheDocument();
      expect(screen.getByText(/Nova Manufacturing Inc/)).toBeInTheDocument();
      expect(screen.getByText('View Full Details')).toBeInTheDocument();
      expect(screen.getByText('Replace License')).toBeInTheDocument();
    });
  });
});
