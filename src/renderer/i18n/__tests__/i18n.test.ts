import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useI18nStore, SUPPORTED_LANGUAGES } from '../i18nStore';
import { viTranslations } from '../locales/vi';

describe('Frontend i18n Store & Localization', () => {
  beforeEach(() => {
    localStorage.clear();
    useI18nStore.setState({
      language: 'vi',
      translations: viTranslations,
      isLoading: false,
    });
  });

  it('provides configured supported languages (Vietnamese and English)', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('vi');
    expect(codes).toContain('en');
  });

  it('translates keys into Vietnamese when language is set to vi', () => {
    const t = useI18nStore.getState().t;
    expect(t('app.title')).toBe('Nền tảng Thị giác Máy tính Công nghiệp');
    expect(t('inspection.outcome.ok')).toBe('ĐẠT (OK)');
    expect(t('status.online')).toBe('HOẠT ĐỘNG');
  });

  it('switches language cleanly to English and returns English strings', async () => {
    const setLanguage = useI18nStore.getState().setLanguage;
    await setLanguage('en');

    const state = useI18nStore.getState();
    expect(state.language).toBe('en');
    expect(state.t('app.title')).toBe('Machine Vision Platform');
    expect(state.t('inspection.outcome.ok')).toBe('PASS (OK)');
    expect(state.t('status.online')).toBe('ONLINE');
  });

  it('interpolates template parameters accurately', () => {
    const t = useI18nStore.getState().t;
    const interpolated = t('status.active_pipeline', {
      name: 'BottleCapInspection',
      version: '1.2.0',
    });
    expect(interpolated).toBe('Đang chạy: BottleCapInspection v1.2.0');
  });

  it('falls back gracefully to English or key when key is unknown', () => {
    const t = useI18nStore.getState().t;
    expect(t('unknown.non_existent_key')).toBe('unknown.non_existent_key');
    expect(t('unknown.key_with_fallback', undefined, 'Fallback Text')).toBe('Fallback Text');
  });

  it('fetches remote translations from backend when syncWithBackend is called', async () => {
    const mockRemote = {
      'app.title': 'Bản Dịch Từ Server',
      'custom.server_key': 'Server Value',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockRemote),
    } as unknown as Response);

    await useI18nStore.getState().syncWithBackend();

    const t = useI18nStore.getState().t;
    expect(t('custom.server_key')).toBe('Server Value');
    expect(t('app.title')).toBe('Bản Dịch Từ Server');
  });
});
