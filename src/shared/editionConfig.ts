import {
  BUILD_APP_ID,
  BUILD_DEPLOYMENT_MODE,
  BUILD_EDITION_NAME,
  BUILD_PRODUCT_NAME,
  DeploymentMode,
} from './editionConfig.generated';

export type { DeploymentMode };

export interface EditionMetadata {
  deploymentMode: DeploymentMode;
  editionName: string;
  productName: string;
  appId: string;
  isProductionEdition: boolean;
  isDeveloperEdition: boolean;
}

const EDITION_PRESETS: Record<DeploymentMode, Omit<EditionMetadata, 'isProductionEdition' | 'isDeveloperEdition'>> = {
  developer: {
    deploymentMode: 'developer',
    editionName: 'INVI Machine Vision Platform — Developer Edition',
    productName: 'INVI Machine Vision Platform Developer',
    appId: 'com.invi.machinevision.developer',
  },
  production: {
    deploymentMode: 'production',
    editionName: 'INVI Machine Vision Platform — Production Edition',
    productName: 'INVI Machine Vision Platform Production',
    appId: 'com.invi.machinevision.production',
  },
};

/**
 * Resolves the active deployment mode ('developer' | 'production').
 *
 * Security & Packaging Rules:
 * 1. If built as the Production Edition (`BUILD_DEPLOYMENT_MODE === 'production'`),
 *    it is strictly locked to `'production'` and cannot be downgraded to `'developer'`
 *    by runtime environment variables.
 * 2. In Developer Edition or local test runs, an explicit `NOVA_DEPLOYMENT_MODE=production`
 *    process env var or Electron preload bridge can run the app in Production Mode for testing.
 */
export function resolveDeploymentMode(overrideMode?: string | null): DeploymentMode {
  if (BUILD_DEPLOYMENT_MODE === 'production') {
    return 'production';
  }

  if (overrideMode === 'production' || overrideMode === 'developer') {
    return overrideMode;
  }

  // Check Node/Electron main/preload process.env if available
  const rawEnvMode = typeof process !== 'undefined' ? (process.env?.INVI_DEPLOYMENT_MODE || process.env?.NOVA_DEPLOYMENT_MODE) : undefined;
  if (rawEnvMode) {
    const envMode = rawEnvMode.trim().toLowerCase();
    if (envMode === 'production') {
      return 'production';
    }
    if (envMode === 'developer') {
      return 'developer';
    }
  }

  // Check Electron preload bridge in Renderer if available
  const globalObj = globalThis as unknown as {
    electronAPI?: { getDeploymentMode?: () => DeploymentMode };
  };
  if (typeof globalObj.electronAPI?.getDeploymentMode === 'function') {
    const ipcMode = globalObj.electronAPI.getDeploymentMode();
    if (ipcMode === 'production' || ipcMode === 'developer') {
      return ipcMode;
    }
  }

  return BUILD_DEPLOYMENT_MODE;
}

export function getEditionMetadata(overrideMode?: string | null): EditionMetadata {
  const mode = resolveDeploymentMode(overrideMode);
  const preset = EDITION_PRESETS[mode] || {
    deploymentMode: BUILD_DEPLOYMENT_MODE,
    editionName: BUILD_EDITION_NAME,
    productName: BUILD_PRODUCT_NAME,
    appId: BUILD_APP_ID,
  };

  return {
    ...preset,
    isProductionEdition: mode === 'production',
    isDeveloperEdition: mode === 'developer',
  };
}

export function isProductionEdition(overrideMode?: string | null): boolean {
  return resolveDeploymentMode(overrideMode) === 'production';
}
