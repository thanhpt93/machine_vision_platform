"""Tests for i18n Service and FastAPI router endpoints."""
import pytest
from fastapi.testclient import TestClient
from vision_runtime.main import app
from vision_runtime.i18n.service import i18n_service


@pytest.fixture
def client():
    return TestClient(app)


def test_i18n_service_loads_catalogs():
    """Verify service loads both Vietnamese and English catalogs with non-empty keys."""
    vi = i18n_service.get_translations("vi", flat=True)
    en = i18n_service.get_translations("en", flat=True)

    assert "app.title" in vi
    assert "app.title" in en
    assert vi["app.title"] != en["app.title"]
    assert "inspection.outcome.ok" in vi
    assert "inspection.outcome.ok" in en


def test_i18n_service_fallback():
    """Verify requesting an unknown language falls back to default without error."""
    unknown = i18n_service.get_translations("fr", flat=True)
    assert len(unknown) > 0
    assert "app.title" in unknown


def test_api_get_supported_languages(client: TestClient):
    """Verify GET /api/i18n/languages returns language list."""
    res = client.get("/api/i18n/languages")
    assert res.status_code == 200
    languages = res.json()
    assert isinstance(languages, list)
    codes = [l["code"] for l in languages]
    assert "vi" in codes
    assert "en" in codes


def test_api_get_translations(client: TestClient):
    """Verify GET /api/i18n/translations returns translation dictionary."""
    res_vi = client.get("/api/i18n/translations?lang=vi&flat=true")
    assert res_vi.status_code == 200
    vi_data = res_vi.json()
    assert "app.title" in vi_data
    assert vi_data["app.title"] == "Nền tảng Thị giác Máy tính Công nghiệp"

    res_en = client.get("/api/i18n/translations?lang=en&flat=true")
    assert res_en.status_code == 200
    en_data = res_en.json()
    assert "app.title" in en_data
    assert en_data["app.title"] == "Industrial Machine Vision Platform"


def test_api_batch_translate(client: TestClient):
    """Verify POST /api/i18n/translate translates requested keys."""
    payload = {
        "lang": "vi",
        "keys": ["app.title", "inspection.outcome.ok", "non.existent.key"]
    }
    res = client.post("/api/i18n/translate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["lang"] == "vi"
    translations = data["translations"]
    assert translations["app.title"] == "Nền tảng Thị giác Máy tính Công nghiệp"
    assert translations["inspection.outcome.ok"] == "ĐẠT (OK)"
    assert translations["non.existent.key"] == "non.existent.key"
