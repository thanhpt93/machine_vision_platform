"""I18n Service for INVI Machine Vision Platform.

Loads language catalogs from vision_runtime/i18n/locales/*.json,
handles hierarchical key lookups, and provides language translation APIs.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("vision_runtime.i18n")

SUPPORTED_LANGUAGES = [
    {
        "code": "vi",
        "name": "Tiếng Việt",
        "native_name": "Tiếng Việt",
        "flag": "🇻🇳",
        "is_default": True,
    },
    {
        "code": "en",
        "name": "English",
        "native_name": "English",
        "flag": "🇬🇧",
        "is_default": False,
    },
]


def _flatten_dict(d: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, str]:
    """Recursively flattens a nested dictionary into dot-separated keys."""
    items: List[tuple] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, (str, int, float, bool)):
            items.append((new_key, str(v)))
    return dict(items)


class I18nService:
    """Manages localization bundles, language selection, and content translation."""

    def __init__(self, locales_dir: Optional[Path] = None):
        if locales_dir is None:
            self.locales_dir = Path(__file__).parent / "locales"
        else:
            self.locales_dir = locales_dir
        self._catalogs: Dict[str, Dict[str, Any]] = {}
        self._flat_catalogs: Dict[str, Dict[str, str]] = {}
        self.load_all_catalogs()

    def load_all_catalogs(self) -> None:
        """Reads all JSON locale files from locales_dir into memory."""
        self._catalogs.clear()
        self._flat_catalogs.clear()
        if not self.locales_dir.is_dir():
            logger.warning("Locales directory not found: %s", self.locales_dir)
            return

        for f in self.locales_dir.glob("*.json"):
            lang = f.stem.lower()
            try:
                content = json.loads(f.read_text(encoding="utf-8"))
                self._catalogs[lang] = content
                self._flat_catalogs[lang] = _flatten_dict(content)
                logger.info("Loaded i18n locale '%s' with %d keys", lang, len(self._flat_catalogs[lang]))
            except Exception as e:
                logger.error("Failed to load locale file %s: %s", f, e)

    def get_supported_languages(self) -> List[Dict[str, Any]]:
        """Returns the list of configured supported languages with metadata."""
        return SUPPORTED_LANGUAGES

    def get_translations(self, lang: str = "vi", flat: bool = True) -> Dict[str, Any]:
        """Returns translation catalog for requested language. Falls back to 'en' or 'vi' if missing."""
        lang = lang.lower().strip()
        if flat:
            if lang in self._flat_catalogs:
                return self._flat_catalogs[lang]
            # Fallback to en or vi
            return self._flat_catalogs.get("en", self._flat_catalogs.get("vi", {}))
        else:
            if lang in self._catalogs:
                return self._catalogs[lang]
            return self._catalogs.get("en", self._catalogs.get("vi", {}))

    def translate_key(self, key: str, lang: str = "vi", default: Optional[str] = None) -> str:
        """Looks up a specific translation key in the target language catalog with fallback."""
        flat = self.get_translations(lang=lang, flat=True)
        if key in flat:
            return flat[key]
        # Fallback to English
        en_flat = self.get_translations(lang="en", flat=True)
        if key in en_flat:
            return en_flat[key]
        return default or key

    def translate_batch(self, keys: List[str], lang: str = "vi") -> Dict[str, str]:
        """Translates a batch list of keys into a key-value mapping."""
        return {k: self.translate_key(k, lang=lang) for k in keys}


i18n_service = I18nService()
