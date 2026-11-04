import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageSelector } from '../LanguageSelector';
import { useI18nStore } from '../../i18n/i18nStore';

describe('LanguageSelector Component', () => {
  beforeEach(() => {
    localStorage.clear();
    useI18nStore.setState({ language: 'vi' });
  });

  it('renders language selector button with current language flag and code', () => {
    render(<LanguageSelector />);
    const btn = screen.getByTestId('language-selector-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('🇻🇳');
    expect(btn).toHaveTextContent('VI');
  });

  it('opens language dropdown when clicked and lists all supported languages', () => {
    render(<LanguageSelector />);
    const btn = screen.getByTestId('language-selector-btn');
    fireEvent.click(btn);

    expect(screen.getByTestId('language-dropdown-menu')).toBeInTheDocument();
    expect(screen.getByTestId('select-lang-vi')).toBeInTheDocument();
    expect(screen.getByTestId('select-lang-en')).toBeInTheDocument();
  });

  it('switches active language when user selects a different language from dropdown', async () => {
    render(<LanguageSelector />);
    const btn = screen.getByTestId('language-selector-btn');
    fireEvent.click(btn);

    const enOption = screen.getByTestId('select-lang-en');
    fireEvent.click(enOption);

    expect(useI18nStore.getState().language).toBe('en');
    expect(btn).toHaveTextContent('EN');
  });
});
