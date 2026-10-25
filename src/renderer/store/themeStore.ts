import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

interface ThemeStoreState {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'mvp_theme';

function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  }
  return 'dark'; // Industrial vision defaults to dark theme
}

function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

// Initial application
if (typeof window !== 'undefined') {
  applyThemeToDocument(getInitialTheme());
}

export const useThemeStore = create<ThemeStoreState>((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () => {
    set((state) => {
      const nextTheme: ThemeMode = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      }
      applyThemeToDocument(nextTheme);
      return { theme: nextTheme };
    });
  },

  setTheme: (theme: ThemeMode) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    applyThemeToDocument(theme);
    set({ theme });
  },
}));
