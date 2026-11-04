import { create } from 'zustand';
import { viTranslations } from './locales/vi';
import { enTranslations } from './locales/en';

export type SupportedLanguage = 'vi' | 'en';

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  native_name: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'vi', name: 'Tiếng Việt', native_name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', name: 'English', native_name: 'English', flag: '🇬🇧' },
];

const LOCAL_STORAGE_KEY = 'invi_language_preference';

interface I18nState {
  language: SupportedLanguage;
  translations: Record<string, string>;
  isLoading: boolean;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  syncWithBackend: () => Promise<void>;
}

function getInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') {
      return saved;
    }
  } catch {
    // Ignore restricted storage
  }
  return 'en';
}

function getDefaultTranslations(lang: SupportedLanguage): Record<string, string> {
  return lang === 'en' ? enTranslations : viTranslations;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}

export const useI18nStore = create<I18nState>((set, get) => {
  const initialLang = getInitialLanguage();

  return {
    language: initialLang,
    translations: getDefaultTranslations(initialLang),
    isLoading: false,

    setLanguage: async (lang: SupportedLanguage) => {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, lang);
      } catch {
        // Ignore
      }

      // Immediately switch to bundled translation for instant zero-latency UI reaction
      const localDict = getDefaultTranslations(lang);
      set({ language: lang, translations: localDict });

      // Then attempt to sync with backend for any dynamic or server-side additions
      await get().syncWithBackend();
    },

    syncWithBackend: async () => {
      const currentLang = get().language;
      const baseUrl =
        typeof window !== 'undefined' && window.electronAPI?.getRuntimeDefaultUrl
          ? window.electronAPI.getRuntimeDefaultUrl()
          : 'http://127.0.0.1:8000';

      try {
        set({ isLoading: true });
        const res = await fetch(`${baseUrl}/api/i18n/translations?lang=${currentLang}&flat=true`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const remoteTranslations = (await res.json()) as Record<string, string>;
          // Merge local fallback with server translations
          const merged = { ...getDefaultTranslations(currentLang), ...remoteTranslations };
          set({ translations: merged });
        }
      } catch {
        // Gracefully use local bundled dictionary when offline
      } finally {
        set({ isLoading: false });
      }
    },

    t: (key: string, params?: Record<string, string | number>, fallback?: string): string => {
      const { translations } = get();
      let text = translations[key];

      // If missing in current language, check English fallback, then provided fallback, then key
      if (!text) {
        text = enTranslations[key] || fallback || key;
      }

      return interpolate(text, params);
    },
  };
});

/**
 * Convenient React Hook for component consumption
 */
export function useTranslation() {
  const t = useI18nStore((s) => s.t);
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const isLoading = useI18nStore((s) => s.isLoading);

  return { t, language, setLanguage, isLoading, supportedLanguages: SUPPORTED_LANGUAGES };
}
