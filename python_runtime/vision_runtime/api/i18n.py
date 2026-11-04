"""FastAPI Router for Internationalization (i18n) and Translation Services."""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from vision_runtime.i18n.service import i18n_service

router = APIRouter(prefix="/api/i18n", tags=["Internationalization"])


class LanguageInfo(BaseModel):
    code: str
    name: str
    native_name: str
    flag: str
    is_default: bool = False


class TranslationBatchRequest(BaseModel):
    lang: str = Field(default="vi", description="Target language code (e.g. 'vi', 'en')")
    keys: List[str] = Field(default_factory=list, description="List of dot-notated translation keys")


class TranslationBatchResponse(BaseModel):
    lang: str
    translations: Dict[str, str]


@router.get("/languages", response_model=List[LanguageInfo], summary="Get supported UI languages")
async def get_supported_languages() -> List[LanguageInfo]:
    """Returns available user interface languages with code, name, and visual flag."""
    return [LanguageInfo(**lang) for lang in i18n_service.get_supported_languages()]


@router.get("/translations", response_model=Dict[str, Any], summary="Get translation bundle for a language")
async def get_translations(
    lang: str = Query(default="vi", description="Language code ('vi' or 'en')"),
    flat: bool = Query(default=True, description="Whether to return flattened dot-notation keys"),
) -> Dict[str, Any]:
    """Returns the complete localization catalog for the requested language."""
    return i18n_service.get_translations(lang=lang, flat=flat)


@router.post("/translate", response_model=TranslationBatchResponse, summary="Batch translate keys on backend")
async def translate_batch(req: TranslationBatchRequest) -> TranslationBatchResponse:
    """Translates a batch of keys or content on the backend into the requested language."""
    translations = i18n_service.translate_batch(keys=req.keys, lang=req.lang)
    return TranslationBatchResponse(lang=req.lang, translations=translations)
