import { create } from 'zustand';
import {
  HealthCheckResult,
  InputImageMetadata,
  InspectionRecord,
  ProductionReleaseDetails,
  ProductionReleaseSummary,
} from '../../types/api';
import { runtimeApi } from '../../services/runtimeApi';

export type ProductionNavPage =
  | 'dashboard'
  | 'inspection'
  | 'history'
  | 'pipelines'
  | 'system_status'
  | 'settings';

export interface ProductionPreferences {
  defaultViewerBg: 'checkerboard' | 'dark' | 'light';
  autoSelectProcessedImage: boolean;
  historyPageSize: number;
}

export interface ProductionStoreState {
  // Navigation
  activePage: ProductionNavPage;
  setActivePage: (page: ProductionNavPage) => void;

  // Runtime Health
  healthResult: HealthCheckResult | null;
  isCheckingHealth: boolean;
  refreshHealth: () => Promise<HealthCheckResult>;

  // Released Pipelines (Eligible for Production + All Releases for Read-Only Pipeline Management)
  eligibleReleases: ProductionReleaseSummary[];
  allReleases: ProductionReleaseSummary[];
  isLoadingReleases: boolean;
  releasesError: string | null;
  fetchReleases: () => Promise<void>;

  // Selected Pipeline for Inspection
  selectedReleaseKey: string | null; // `${pipeline_id}::${release_version}`
  selectedReleaseDetails: ProductionReleaseDetails | null;
  isLoadingReleaseDetails: boolean;
  selectRelease: (pipelineId: string, releaseVersion: string) => Promise<void>;

  // Selected Input Image for Inspection
  selectedImagePath: string | null;
  selectedImageMeta: InputImageMetadata | null;
  isValidatingImage: boolean;
  imageValidationError: string | null;
  selectInputImage: (filePath: string) => Promise<boolean>;
  clearInputImage: () => void;

  // Active Inspection Execution
  isRunningInspection: boolean;
  activeRequestId: number;
  currentInspection: InspectionRecord | null;
  inspectionError: string | null;
  runInspection: () => Promise<InspectionRecord | null>;
  cancelActiveInspection: () => Promise<void>;
  viewInspectionRecord: (record: InspectionRecord, navigateToPage?: ProductionNavPage) => void;

  // Inspection History
  inspectionsHistory: InspectionRecord[];
  isLoadingHistory: boolean;
  historyError: string | null;
  fetchInspectionsHistory: (limit?: number) => Promise<void>;

  // User Preferences (Settings Page)
  preferences: ProductionPreferences;
  updatePreferences: (partial: Partial<ProductionPreferences>) => void;
}

const PREFS_STORAGE_KEY = 'nova_production_preferences';

function loadInitialPreferences(): ProductionPreferences {
  const defaults: ProductionPreferences = {
    defaultViewerBg: 'checkerboard',
    autoSelectProcessedImage: true,
    historyPageSize: 25,
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaults, ...parsed };
      }
    } catch {
      // Ignore storage errors
    }
  }
  return defaults;
}

export function makeReleaseKey(pipelineId: string, releaseVersion: string): string {
  return `${pipelineId}::${releaseVersion}`;
}

export function parseReleaseKey(key: string): { pipelineId: string; releaseVersion: string } | null {
  const idx = key.indexOf('::');
  if (idx <= 0) return null;
  return {
    pipelineId: key.slice(0, idx),
    releaseVersion: key.slice(idx + 2),
  };
}

export const useProductionStore = create<ProductionStoreState>((set, get) => ({
  activePage: 'inspection',
  setActivePage: (page: ProductionNavPage) => {
    set({ activePage: page });
  },

  healthResult: null,
  isCheckingHealth: false,
  refreshHealth: async () => {
    set({ isCheckingHealth: true });
    try {
      const res = await runtimeApi.checkHealth();
      set({ healthResult: res, isCheckingHealth: false });
      return res;
    } catch (err: unknown) {
      const fallback: HealthCheckResult = {
        data: null,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
      set({ healthResult: fallback, isCheckingHealth: false });
      return fallback;
    }
  },

  eligibleReleases: [],
  allReleases: [],
  isLoadingReleases: false,
  releasesError: null,
  fetchReleases: async () => {
    set({ isLoadingReleases: true, releasesError: null });
    try {
      const [eligibleRes, allRes] = await Promise.all([
        runtimeApi.listProductionReleases({ includeArchived: false }),
        runtimeApi.listProductionReleases({ includeArchived: true }),
      ]);

      const validEligible = (eligibleRes.releases || []).filter(
        (r: ProductionReleaseSummary) => r.status === 'Released' && r.valid_integrity !== false
      );
      const allList = allRes.releases || [];

      set({
        eligibleReleases: validEligible,
        allReleases: allList,
        isLoadingReleases: false,
        releasesError: null,
      });

      // Auto-select active or first eligible release if none is currently selected or if current selection is no longer eligible
      const currentKey = get().selectedReleaseKey;
      const stillEligible = currentKey
        ? validEligible.some(
            (r: ProductionReleaseSummary) =>
              makeReleaseKey(r.pipeline_id, r.release_version) === currentKey
          )
        : false;

      if (!stillEligible && validEligible.length > 0) {
        const preferred =
          validEligible.find((r: ProductionReleaseSummary) => r.is_active) || validEligible[0];
        await get().selectRelease(preferred.pipeline_id, preferred.release_version);
      } else if (validEligible.length === 0) {
        set({
          selectedReleaseKey: null,
          selectedReleaseDetails: null,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isLoadingReleases: false,
        releasesError: msg,
      });
    }
  },

  selectedReleaseKey: null,
  selectedReleaseDetails: null,
  isLoadingReleaseDetails: false,
  selectRelease: async (pipelineId: string, releaseVersion: string) => {
    const key = makeReleaseKey(pipelineId, releaseVersion);
    set({
      selectedReleaseKey: key,
      isLoadingReleaseDetails: true,
      inspectionError: null,
    });

    try {
      const details = await runtimeApi.getProductionReleaseDetails(pipelineId, releaseVersion);
      // Only update if user hasn't switched to another release while loading
      if (get().selectedReleaseKey === key) {
        set({
          selectedReleaseDetails: details,
          isLoadingReleaseDetails: false,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (get().selectedReleaseKey === key) {
        set({
          selectedReleaseDetails: null,
          isLoadingReleaseDetails: false,
          inspectionError: `Failed to load release details: ${msg}`,
        });
      }
    }
  },

  selectedImagePath: null,
  selectedImageMeta: null,
  isValidatingImage: false,
  imageValidationError: null,
  selectInputImage: async (filePath: string) => {
    const trimmed = filePath.trim();
    if (!trimmed) {
      set({
        selectedImagePath: null,
        selectedImageMeta: null,
        imageValidationError: 'Please select a valid image file path.',
      });
      return false;
    }

    set({
      selectedImagePath: trimmed,
      selectedImageMeta: null,
      isValidatingImage: true,
      imageValidationError: null,
      inspectionError: null,
    });

    try {
      const meta = await runtimeApi.getInputImageInfo(trimmed);
      if (get().selectedImagePath === trimmed) {
        set({
          selectedImageMeta: meta,
          isValidatingImage: false,
          imageValidationError: null,
        });
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (get().selectedImagePath === trimmed) {
        set({
          selectedImageMeta: null,
          isValidatingImage: false,
          imageValidationError: msg,
        });
      }
      return false;
    }
  },

  clearInputImage: () => {
    set({
      selectedImagePath: null,
      selectedImageMeta: null,
      isValidatingImage: false,
      imageValidationError: null,
    });
  },

  isRunningInspection: false,
  activeRequestId: 0,
  currentInspection: null,
  inspectionError: null,
  runInspection: async () => {
    const {
      isRunningInspection,
      selectedReleaseKey,
      selectedImagePath,
      imageValidationError,
      eligibleReleases,
    } = get();

    // Prevent duplicate concurrent submissions
    if (isRunningInspection) {
      return null;
    }

    if (!selectedReleaseKey) {
      set({ inspectionError: 'No released pipeline is selected.' });
      return null;
    }

    const parsed = parseReleaseKey(selectedReleaseKey);
    if (!parsed) {
      set({ inspectionError: 'Invalid pipeline release selection.' });
      return null;
    }

    const isEligible = eligibleReleases.some(
      (r: ProductionReleaseSummary) =>
        r.pipeline_id === parsed.pipelineId &&
        r.release_version === parsed.releaseVersion &&
        r.status === 'Released' &&
        r.valid_integrity !== false
    );
    if (!isEligible) {
      set({
        inspectionError: `Selected release ${parsed.pipelineId} v${parsed.releaseVersion} is no longer eligible for Production execution.`,
      });
      return null;
    }

    if (!selectedImagePath) {
      set({ inspectionError: 'Please select an input image file before running inspection.' });
      return null;
    }

    if (imageValidationError) {
      set({ inspectionError: `Invalid input image: ${imageValidationError}` });
      return null;
    }

    const nextReqId = get().activeRequestId + 1;
    set({
      isRunningInspection: true,
      activeRequestId: nextReqId,
      inspectionError: null,
    });

    try {
      const record = await runtimeApi.startInspection({
        pipelineId: parsed.pipelineId,
        releaseVersion: parsed.releaseVersion,
        imagePath: selectedImagePath,
      });

      // Prevent stale results from overwriting newer state
      if (get().activeRequestId !== nextReqId) {
        return null;
      }

      set((state) => ({
        isRunningInspection: false,
        currentInspection: record,
        inspectionError: null,
        inspectionsHistory: [
          record,
          ...state.inspectionsHistory.filter((i) => i.inspection_id !== record.inspection_id),
        ],
      }));

      return record;
    } catch (err: unknown) {
      if (get().activeRequestId !== nextReqId) {
        return null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isRunningInspection: false,
        inspectionError: msg,
      });
      return null;
    }
  },

  cancelActiveInspection: async () => {
    const { currentInspection, isRunningInspection } = get();
    if (!isRunningInspection && !currentInspection) return;

    if (
      currentInspection &&
      (currentInspection.execution_status === 'QUEUED' ||
        currentInspection.execution_status === 'RUNNING')
    ) {
      try {
        const cancelled = await runtimeApi.cancelInspection(currentInspection.inspection_id);
        set({
          isRunningInspection: false,
          currentInspection: cancelled,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        set({
          isRunningInspection: false,
          inspectionError: msg,
        });
      }
    }
  },

  viewInspectionRecord: (record: InspectionRecord, navigateToPage?: ProductionNavPage) => {
    set({
      currentInspection: record,
      inspectionError: null,
      ...(navigateToPage ? { activePage: navigateToPage } : {}),
    });
  },

  inspectionsHistory: [],
  isLoadingHistory: false,
  historyError: null,
  fetchInspectionsHistory: async (limit?: number) => {
    const targetLimit = limit ?? Math.max(100, get().preferences.historyPageSize * 4);
    set({ isLoadingHistory: true, historyError: null });
    try {
      const res = await runtimeApi.listInspections(targetLimit);
      set({
        inspectionsHistory: res.inspections || [],
        isLoadingHistory: false,
        historyError: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isLoadingHistory: false,
        historyError: msg,
      });
    }
  },

  preferences: loadInitialPreferences(),
  updatePreferences: (partial: Partial<ProductionPreferences>) => {
    set((state) => {
      const next = { ...state.preferences, ...partial };
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
      }
      return { preferences: next };
    });
  },
}));
