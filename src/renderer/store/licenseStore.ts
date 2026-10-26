import { create } from 'zustand';
import { runtimeApi } from '../services/runtimeApi';
import {
  LicenseDetailsResponse,
  LicenseStatusResponse,
} from '../license/types';

interface LicenseState {
  licenseStatus: LicenseStatusResponse | null;
  licenseDetails: LicenseDetailsResponse | null;
  isLoading: boolean;
  isActivating: boolean;
  error: string | null;
  showActivationModal: boolean;
  showDetailsModal: boolean;

  openActivationModal: () => void;
  closeActivationModal: () => void;
  openDetailsModal: () => void;
  closeDetailsModal: () => void;
  setError: (err: string | null) => void;

  refreshLicenseStatus: () => Promise<LicenseStatusResponse | null>;
  fetchLicenseDetails: () => Promise<LicenseDetailsResponse | null>;
  importLicenseFromContent: (content: string) => Promise<{ success: boolean; message: string }>;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseStatus: null,
  licenseDetails: null,
  isLoading: false,
  isActivating: false,
  error: null,
  showActivationModal: false,
  showDetailsModal: false,

  openActivationModal: () => set({ showActivationModal: true, error: null }),
  closeActivationModal: () => set({ showActivationModal: false, error: null }),
  openDetailsModal: () => {
    set({ showDetailsModal: true });
    get().fetchLicenseDetails().catch(() => {});
  },
  closeDetailsModal: () => set({ showDetailsModal: false }),
  setError: (error) => set({ error }),

  refreshLicenseStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await runtimeApi.getLicenseStatus();
      set({ licenseStatus: status, isLoading: false });
      return status;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: msg });
      return null;
    }
  },

  fetchLicenseDetails: async () => {
    try {
      const details = await runtimeApi.getLicenseDetails();
      set({ licenseDetails: details });
      return details;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      return null;
    }
  },

  importLicenseFromContent: async (content: string) => {
    set({ isActivating: true, error: null });
    try {
      const resp = await runtimeApi.importLicense({ artifact_text: content });
      await get().refreshLicenseStatus();
      await get().fetchLicenseDetails();
      set({ isActivating: false });
      return { success: true, message: resp.message };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActivating: false, error: msg });
      return { success: false, message: msg };
    }
  },
}));
