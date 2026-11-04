import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation, SupportedLanguage } from '../i18n/i18nStore';

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  compact = false,
  className = '',
}) => {
  const { language, setLanguage, supportedLanguages, isLoading } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = supportedLanguages.find((l) => l.code === language) || supportedLanguages[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isLoading}
        data-testid="language-selector-btn"
        className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors shadow-xs select-none"
        title="Chọn ngôn ngữ hiển thị / Select Language"
      >
        <span className="text-xs leading-none">{currentLang.flag}</span>
        <span className="text-[11px] font-semibold uppercase font-mono">
          {currentLang.code.toUpperCase()}
        </span>
        {!compact && (
          <span className="text-[11px] font-medium hidden sm:inline text-slate-600 dark:text-slate-300">
            {currentLang.native_name}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500" />
      </button>

      {isOpen && (
        <div
          data-testid="language-dropdown-menu"
          className="absolute right-0 mt-1.5 w-44 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 flex items-center space-x-1">
            <Globe className="w-3 h-3" />
            <span>Ngôn ngữ / Language</span>
          </div>

          <div className="p-1 space-y-0.5">
            {supportedLanguages.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang.code)}
                  data-testid={`select-lang-${lang.code}`}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">{lang.flag}</span>
                    <span>{lang.native_name}</span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      ({lang.code})
                    </span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
