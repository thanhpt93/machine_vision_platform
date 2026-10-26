"""Shared Python License Validator & Storage Service for NOVA Machine Vision Platform.

Implements the exact cryptographic verification, canonical RFC 8785 serialization,
and public-key trust model defined by NOVA License Management.
Contains ONLY public key material; never embeds private signing keys.
"""

import base64
import hashlib
import json
import os
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import HTTPException, status

from vision_runtime.config import settings
from vision_runtime.models.license import (
    LicenseDetailsResponse,
    LicenseLimitsModel,
    LicensePayloadModel,
    LicenseStatusEnum,
    LicenseStatusResponse,
    LicenseValidateResponse,
    SignedLicenseEnvelopeModel,
)

ARTIFACT_FORMAT_V1 = "NOVA-LICENSE-ENVELOPE-V1"
ALGORITHM_ED25519 = "Ed25519"
PAYLOAD_SCHEMA_VERSION = "1.0"
PRODUCT_ID_MVP = "NOVA-MVP"

# Maximum allowable license artifact file size (1 MB)
MAX_LICENSE_FILE_BYTES = 1024 * 1024

# Official Active Public Keys trusted by NOVA Machine Vision Platform
DEFAULT_TRUSTED_PUBLIC_KEYS: Dict[str, str] = {
    "nova-key-2026-01": (
        "-----BEGIN PUBLIC KEY-----\n"
        "MCowBQYDK2VwAyEACGcJhmwm49O8M7bVPf2HpBehD8Gm3O0RYS17vnDtiho=\n"
        "-----END PUBLIC KEY-----\n"
    )
}


class LicenseVerificationError(Exception):
    """Raised when an artifact fails schema or cryptographic signature verification."""

    def __init__(self, message: str, status_code: LicenseStatusEnum = LicenseStatusEnum.UNSUPPORTED_LICENSE):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def format_utc_timestamp(dt: Optional[datetime]) -> Optional[str]:
    """Formats a datetime to canonical ISO-8601 UTC string with second precision and 'Z' suffix."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc_timestamp(ts: str) -> datetime:
    """Parses an ISO-8601 UTC string ('YYYY-MM-DDTHH:MM:SSZ')."""
    if not isinstance(ts, str) or not ts.endswith("Z"):
        raise ValueError(f"Timestamp must be an ISO-8601 UTC string ending with 'Z': {ts}")
    dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    return dt.replace(tzinfo=timezone.utc)


def _normalize_canonical_value(value: Any) -> Any:
    """Recursively normalizes strings (NFC), lists, dicts, ints, and nulls for canonical JSON."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        raise ValueError("Floating-point numbers are not permitted in canonical license payloads")
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_canonical_value(item) for item in value]
    if isinstance(value, dict):
        return {
            unicodedata.normalize("NFC", str(k)): _normalize_canonical_value(v)
            for k, v in value.items()
        }
    raise TypeError(f"Unsupported type in canonical payload: {type(value)}")


def canonicalize_payload(payload: Dict[str, Any]) -> bytes:
    """Produces deterministic RFC 8785 / JCS compatible UTF-8 bytes from a license payload dictionary.

    - Keys sorted lexicographically at all levels (sort_keys=True)
    - Compact separators (",", ":") with no insignificant whitespace
    - UTF-8 encoding without ASCII escaping (ensure_ascii=False)
    - Strings normalized to Unicode NFC
    - 'features' list deduplicated and sorted lexicographically
    """
    normalized = _normalize_canonical_value(payload)
    if "features" in normalized and isinstance(normalized["features"], list):
        normalized["features"] = sorted({str(f) for f in normalized["features"]})
    canonical_str = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return canonical_str.encode("utf-8")


def load_ed25519_public_key(public_key_pem: str) -> Ed25519PublicKey:
    """Loads an Ed25519 public key from PEM string."""
    try:
        key = serialization.load_pem_public_key(public_key_pem.strip().encode("utf-8"))
    except Exception as exc:
        raise LicenseVerificationError(
            f"Invalid public key PEM format: {exc}",
            LicenseStatusEnum.UNSUPPORTED_LICENSE,
        ) from exc
    if not isinstance(key, Ed25519PublicKey):
        raise LicenseVerificationError(
            "Configured public key is not an Ed25519 key",
            LicenseStatusEnum.UNSUPPORTED_LICENSE,
        )
    return key


def compute_public_key_fingerprint(public_key_pem: str) -> str:
    """Computes SHA-256 hex digest over the raw 32-byte Ed25519 public key."""
    pub_key = load_ed25519_public_key(public_key_pem)
    raw_bytes = pub_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return hashlib.sha256(raw_bytes).hexdigest()


class LicenseService:
    """Manages license verification, status checks, and atomic disk persistence."""

    def __init__(self, storage_dir: Optional[Path] = None):
        self._custom_storage_dir = storage_dir
        self._trusted_keys: Dict[str, str] = dict(DEFAULT_TRUSTED_PUBLIC_KEYS)
        self._load_additional_trusted_keys()

    @property
    def storage_dir(self) -> Path:
        if self._custom_storage_dir is not None:
            path = self._custom_storage_dir
        else:
            path = Path(settings.data_dir) / "license"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def active_license_path(self) -> Path:
        return self.storage_dir / "active_license.novalic.json"

    def get_running_edition(self) -> str:
        """Determines the current running application edition ('developer' or 'production')."""
        mode = os.environ.get("NOVA_DEPLOYMENT_MODE", "developer").strip().lower()
        return "production" if mode == "production" else "developer"

    def register_trusted_public_key(self, key_id: str, pem: str) -> None:
        """Registers or overrides a trusted public key (used for key rotation or testing)."""
        load_ed25519_public_key(pem)  # Validate syntax
        self._trusted_keys[key_id.strip()] = pem.strip()

    def _load_additional_trusted_keys(self) -> None:
        """Loads additional trusted public keys from environment or keys directory if present."""
        env_pem = os.environ.get("NOVA_PUBLIC_KEY_PEM")
        env_key_id = os.environ.get("NOVA_PUBLIC_KEY_ID")
        if env_pem and env_key_id:
            try:
                self.register_trusted_public_key(env_key_id, env_pem)
            except Exception:
                pass

        keys_dir = Path(settings.data_dir) / "keys"
        if keys_dir.is_dir():
            for key_file in keys_dir.glob("*.pem"):
                key_id = key_file.stem.replace("_public", "")
                try:
                    self.register_trusted_public_key(key_id, key_file.read_text(encoding="utf-8"))
                except Exception:
                    pass

    def get_public_key(self, key_id: str) -> Optional[str]:
        return self._trusted_keys.get(key_id)

    # --------------------------------------------------------------------------
    # Cryptographic & Policy Verification
    # --------------------------------------------------------------------------

    def verify_envelope_cryptographically(
        self, envelope: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], str]:
        """Validates envelope structure, schema, and Ed25519 digital signature.

        Returns (validated_payload_dict, key_id) or raises LicenseVerificationError.
        """
        if not isinstance(envelope, dict):
            raise LicenseVerificationError(
                "License artifact must be a JSON object",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        if envelope.get("artifact_format") != ARTIFACT_FORMAT_V1:
            raise LicenseVerificationError(
                f"Unsupported artifact_format: '{envelope.get('artifact_format')}' (expected '{ARTIFACT_FORMAT_V1}')",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        if envelope.get("algorithm") != ALGORITHM_ED25519:
            raise LicenseVerificationError(
                f"Unsupported signature algorithm: '{envelope.get('algorithm')}' (expected '{ALGORITHM_ED25519}')",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        key_id = envelope.get("key_id")
        if not isinstance(key_id, str) or not key_id.strip():
            raise LicenseVerificationError(
                "Missing or empty key_id in license artifact envelope",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        pub_pem = self.get_public_key(key_id)
        if not pub_pem:
            raise LicenseVerificationError(
                f"Unknown or untrusted signing key ID: '{key_id}'. Cannot verify license signature.",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        payload = envelope.get("payload")
        if not isinstance(payload, dict):
            raise LicenseVerificationError(
                "Missing or invalid payload in license artifact envelope",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        if payload.get("key_id") != key_id:
            raise LicenseVerificationError(
                f"Envelope key_id ('{key_id}') does not match payload key_id ('{payload.get('key_id')}')",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        # Validate payload schema fields
        self.validate_payload_schema(payload)

        signature_b64 = envelope.get("signature")
        if not isinstance(signature_b64, str) or not signature_b64.strip():
            raise LicenseVerificationError(
                "Missing or empty signature in license artifact envelope",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        try:
            signature_bytes = base64.b64decode(signature_b64, validate=True)
        except Exception as exc:
            raise LicenseVerificationError(
                "Signature string is not valid Base64",
                LicenseStatusEnum.INVALID_SIGNATURE,
            ) from exc

        if len(signature_bytes) != 64:
            raise LicenseVerificationError(
                f"Ed25519 signature must be exactly 64 bytes (got {len(signature_bytes)})",
                LicenseStatusEnum.INVALID_SIGNATURE,
            )

        canonical_bytes = canonicalize_payload(payload)
        pub_key = load_ed25519_public_key(pub_pem)

        try:
            pub_key.verify(signature_bytes, canonical_bytes)
        except InvalidSignature as exc:
            raise LicenseVerificationError(
                "Cryptographic signature verification failed: digital signature does not match canonical payload.",
                LicenseStatusEnum.INVALID_SIGNATURE,
            ) from exc

        return payload, key_id

    def validate_payload_schema(self, payload: Dict[str, Any]) -> None:
        """Validates that payload has all required fields and correct types."""
        required = {
            "schema_version",
            "license_id",
            "license_number",
            "customer_id",
            "customer_code",
            "customer_name",
            "product_id",
            "edition",
            "license_type",
            "issued_at",
            "not_before",
            "expires_at",
            "features",
            "limits",
            "key_id",
        }
        missing = required - set(payload.keys())
        if missing:
            raise LicenseVerificationError(
                f"License payload is missing required field(s): {sorted(missing)}",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        if payload.get("schema_version") != PAYLOAD_SCHEMA_VERSION:
            raise LicenseVerificationError(
                f"Unsupported schema_version: '{payload.get('schema_version')}' (expected '{PAYLOAD_SCHEMA_VERSION}')",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        if payload.get("edition") not in ("developer", "production"):
            raise LicenseVerificationError(
                f"Unsupported edition in license: '{payload.get('edition')}'",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        license_type = payload.get("license_type")
        if license_type not in ("SUBSCRIPTION", "PERPETUAL"):
            raise LicenseVerificationError(
                f"Unsupported license_type: '{license_type}'",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        try:
            not_before_dt = parse_utc_timestamp(payload["not_before"])
            _ = parse_utc_timestamp(payload["issued_at"])
        except Exception as exc:
            raise LicenseVerificationError(
                f"Invalid timestamp in license payload: {exc}",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            ) from exc

        expires_at_val = payload.get("expires_at")
        if license_type == "SUBSCRIPTION":
            if expires_at_val is None:
                raise LicenseVerificationError(
                    "SUBSCRIPTION license must have a non-null expires_at timestamp",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                )
            try:
                expires_at_dt = parse_utc_timestamp(expires_at_val)
            except Exception as exc:
                raise LicenseVerificationError(
                    f"Invalid expires_at timestamp: {exc}",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                ) from exc
            if expires_at_dt <= not_before_dt:
                raise LicenseVerificationError(
                    "expires_at timestamp must be strictly after not_before",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                )
        elif license_type == "PERPETUAL":
            if expires_at_val is not None:
                raise LicenseVerificationError(
                    "PERPETUAL license must have expires_at set to null",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                )

        features = payload.get("features")
        if not isinstance(features, list) or not all(isinstance(f, str) and f.strip() for f in features):
            raise LicenseVerificationError(
                "Field 'features' must be a list of non-empty strings",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        limits = payload.get("limits")
        if not isinstance(limits, dict):
            raise LicenseVerificationError(
                "Field 'limits' must be a JSON object",
                LicenseStatusEnum.UNSUPPORTED_LICENSE,
            )

        for limit_key in ("max_devices", "max_concurrent_inspections", "total_inspection_quota"):
            if limit_key not in limits:
                raise LicenseVerificationError(
                    f"Missing limits field: '{limit_key}'",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                )
            val = limits[limit_key]
            if isinstance(val, bool) or not isinstance(val, int) or val < -1:
                raise LicenseVerificationError(
                    f"Limit '{limit_key}' must be an integer >= -1",
                    LicenseStatusEnum.UNSUPPORTED_LICENSE,
                )

    def evaluate_license_status(
        self,
        payload: Dict[str, Any],
        key_id: str,
        now: Optional[datetime] = None,
    ) -> LicenseStatusResponse:
        """Evaluates business and policy validity (product, edition, time window) for a cryptographically verified payload."""
        if now is None:
            now = datetime.now(timezone.utc)

        running_edition = self.get_running_edition()

        # 1. Product check
        product_id = payload.get("product_id")
        if product_id != PRODUCT_ID_MVP:
            return LicenseStatusResponse(
                status=LicenseStatusEnum.INVALID_PRODUCT,
                is_valid=False,
                edition=payload.get("edition"),
                running_edition=running_edition,
                license_number=payload.get("license_number"),
                customer_name=payload.get("customer_name"),
                customer_code=payload.get("customer_code"),
                product_id=product_id,
                license_type=payload.get("license_type"),
                issued_at=payload.get("issued_at"),
                not_before=payload.get("not_before"),
                expires_at=payload.get("expires_at"),
                features=payload.get("features", []),
                key_id=key_id,
                signature_verified=True,
                message=f"License product '{product_id}' does not match NOVA Machine Vision Platform ('{PRODUCT_ID_MVP}').",
                error_code="INVALID_PRODUCT",
            )

        # 2. Edition check
        license_edition = payload.get("edition")
        if license_edition != running_edition:
            return LicenseStatusResponse(
                status=LicenseStatusEnum.EDITION_MISMATCH,
                is_valid=False,
                edition=license_edition,
                running_edition=running_edition,
                license_number=payload.get("license_number"),
                customer_name=payload.get("customer_name"),
                customer_code=payload.get("customer_code"),
                product_id=product_id,
                license_type=payload.get("license_type"),
                issued_at=payload.get("issued_at"),
                not_before=payload.get("not_before"),
                expires_at=payload.get("expires_at"),
                features=payload.get("features", []),
                key_id=key_id,
                signature_verified=True,
                message=(
                    f"License edition '{license_edition}' is not compatible with running edition '{running_edition}'. "
                    f"Please install the appropriate {running_edition.title()} Edition license."
                ),
                error_code="EDITION_MISMATCH",
            )

        # 3. Not-before check
        not_before_dt = parse_utc_timestamp(payload["not_before"])
        if now < not_before_dt:
            return LicenseStatusResponse(
                status=LicenseStatusEnum.NOT_YET_VALID,
                is_valid=False,
                edition=license_edition,
                running_edition=running_edition,
                license_number=payload.get("license_number"),
                customer_name=payload.get("customer_name"),
                customer_code=payload.get("customer_code"),
                product_id=product_id,
                license_type=payload.get("license_type"),
                issued_at=payload.get("issued_at"),
                not_before=payload.get("not_before"),
                expires_at=payload.get("expires_at"),
                features=payload.get("features", []),
                key_id=key_id,
                signature_verified=True,
                message=f"License is not yet active. Valid beginning from {payload.get('not_before')}.",
                error_code="NOT_YET_VALID",
            )

        # 4. Expiration check (Subscription)
        if payload.get("license_type") == "SUBSCRIPTION":
            expires_at_dt = parse_utc_timestamp(payload["expires_at"])
            if now > expires_at_dt:
                return LicenseStatusResponse(
                    status=LicenseStatusEnum.EXPIRED,
                    is_valid=False,
                    edition=license_edition,
                    running_edition=running_edition,
                    license_number=payload.get("license_number"),
                    customer_name=payload.get("customer_name"),
                    customer_code=payload.get("customer_code"),
                    product_id=product_id,
                    license_type=payload.get("license_type"),
                    issued_at=payload.get("issued_at"),
                    not_before=payload.get("not_before"),
                    expires_at=payload.get("expires_at"),
                    features=payload.get("features", []),
                    key_id=key_id,
                    signature_verified=True,
                    message=f"Subscription license expired on {payload.get('expires_at')}. Please import a renewed license.",
                    error_code="EXPIRED",
                )

        # 5. Passed all checks -> VALID
        return LicenseStatusResponse(
            status=LicenseStatusEnum.VALID,
            is_valid=True,
            edition=license_edition,
            running_edition=running_edition,
            license_number=payload.get("license_number"),
            customer_name=payload.get("customer_name"),
            customer_code=payload.get("customer_code"),
            product_id=product_id,
            license_type=payload.get("license_type"),
            issued_at=payload.get("issued_at"),
            not_before=payload.get("not_before"),
            expires_at=payload.get("expires_at"),
            features=payload.get("features", []),
            key_id=key_id,
            signature_verified=True,
            message=f"License {payload.get('license_number')} is active and valid for {running_edition.title()} Edition.",
            error_code=None,
        )

    # --------------------------------------------------------------------------
    # Storage & Persistence
    # --------------------------------------------------------------------------

    def get_status(self, now: Optional[datetime] = None) -> LicenseStatusResponse:
        """Reads persisted license file, re-verifies cryptographic signature and current expiration status."""
        running_edition = self.get_running_edition()
        if not self.active_license_path.is_file():
            return LicenseStatusResponse(
                status=LicenseStatusEnum.NOT_ACTIVATED,
                is_valid=False,
                edition=None,
                running_edition=running_edition,
                license_number=None,
                customer_name=None,
                customer_code=None,
                product_id=None,
                license_type=None,
                issued_at=None,
                not_before=None,
                expires_at=None,
                features=[],
                key_id=None,
                signature_verified=False,
                message="No license is installed. Please import a signed license artifact to activate the application.",
                error_code="NOT_ACTIVATED",
            )

        try:
            content = self.active_license_path.read_text(encoding="utf-8")
            envelope = json.loads(content)
            payload, key_id = self.verify_envelope_cryptographically(envelope)
            return self.evaluate_license_status(payload, key_id, now=now)
        except json.JSONDecodeError:
            return LicenseStatusResponse(
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                is_valid=False,
                edition=None,
                running_edition=running_edition,
                message="Persisted license file contains corrupted or invalid JSON.",
                error_code="UNSUPPORTED_LICENSE",
            )
        except LicenseVerificationError as exc:
            return LicenseStatusResponse(
                status=exc.status_code,
                is_valid=False,
                edition=None,
                running_edition=running_edition,
                message=exc.message,
                error_code=exc.status_code.value,
            )
        except Exception as exc:
            return LicenseStatusResponse(
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                is_valid=False,
                edition=None,
                running_edition=running_edition,
                message=f"Failed to verify active license: {exc}",
                error_code="UNSUPPORTED_LICENSE",
            )

    def get_details(self, now: Optional[datetime] = None) -> LicenseDetailsResponse:
        """Returns comprehensive sanitized license details."""
        running_edition = self.get_running_edition()
        if not self.active_license_path.is_file():
            return LicenseDetailsResponse(
                has_license=False,
                status=LicenseStatusEnum.NOT_ACTIVATED,
                is_valid=False,
                edition=None,
                running_edition=running_edition,
                features=[],
                signature_verified=False,
                persisted_path=None,
                message="No license file is installed on this machine.",
            )

        try:
            content = self.active_license_path.read_text(encoding="utf-8")
            envelope = json.loads(content)
            payload, key_id = self.verify_envelope_cryptographically(envelope)
            status_resp = self.evaluate_license_status(payload, key_id, now=now)

            pub_pem = self.get_public_key(key_id)
            fingerprint = compute_public_key_fingerprint(pub_pem) if pub_pem else None

            return LicenseDetailsResponse(
                has_license=True,
                status=status_resp.status,
                is_valid=status_resp.is_valid,
                edition=payload.get("edition"),
                running_edition=running_edition,
                license_id=payload.get("license_id"),
                license_number=payload.get("license_number"),
                customer_id=payload.get("customer_id"),
                customer_code=payload.get("customer_code"),
                customer_name=payload.get("customer_name"),
                product_id=payload.get("product_id"),
                license_type=payload.get("license_type"),
                issued_at=payload.get("issued_at"),
                not_before=payload.get("not_before"),
                expires_at=payload.get("expires_at"),
                features=payload.get("features", []),
                limits=payload.get("limits"),
                key_id=key_id,
                key_fingerprint=fingerprint,
                signature_algorithm=envelope.get("algorithm"),
                signature_verified=True,
                persisted_path=str(self.active_license_path),
                message=status_resp.message,
            )
        except Exception as exc:
            status_resp = self.get_status(now=now)
            return LicenseDetailsResponse(
                has_license=True,
                status=status_resp.status,
                is_valid=False,
                running_edition=running_edition,
                features=[],
                signature_verified=False,
                persisted_path=str(self.active_license_path),
                message=f"Error loading license details: {exc}",
            )

    def validate_artifact(
        self,
        artifact: Optional[Dict[str, Any]] = None,
        artifact_text: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> LicenseValidateResponse:
        """Validates an incoming artifact without modifying persistent state."""
        envelope, err = self._parse_incoming_artifact(artifact, artifact_text)
        if err is not None:
            return LicenseValidateResponse(
                valid=False,
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                reason=err,
            )

        try:
            payload, key_id = self.verify_envelope_cryptographically(envelope)
            status_resp = self.evaluate_license_status(payload, key_id, now=now)
            return LicenseValidateResponse(
                valid=status_resp.is_valid,
                status=status_resp.status,
                reason=status_resp.message,
                license_number=payload.get("license_number"),
                edition=payload.get("edition"),
                product_id=payload.get("product_id"),
                key_id=key_id,
                expires_at=payload.get("expires_at"),
                features=payload.get("features", []),
            )
        except LicenseVerificationError as exc:
            return LicenseValidateResponse(
                valid=False,
                status=exc.status_code,
                reason=exc.message,
            )
        except Exception as exc:
            return LicenseValidateResponse(
                valid=False,
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                reason=f"Verification failed: {exc}",
            )

    def import_and_activate(
        self,
        artifact: Optional[Dict[str, Any]] = None,
        artifact_text: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> Tuple[bool, LicenseStatusResponse]:
        """Atomically imports, cryptographically validates, and persists a new license artifact.

        Preserves existing valid license intact if import fails!
        """
        envelope, err = self._parse_incoming_artifact(artifact, artifact_text)
        running_edition = self.get_running_edition()

        if err is not None:
            return False, LicenseStatusResponse(
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                is_valid=False,
                running_edition=running_edition,
                message=err,
                error_code="UNSUPPORTED_LICENSE",
            )

        # 1. Cryptographic and structural verification
        try:
            payload, key_id = self.verify_envelope_cryptographically(envelope)
        except LicenseVerificationError as exc:
            # Failed cryptographic verification: do NOT overwrite active license!
            return False, LicenseStatusResponse(
                status=exc.status_code,
                is_valid=False,
                running_edition=running_edition,
                message=exc.message,
                error_code=exc.status_code.value,
            )

        # 2. Policy & status check
        status_resp = self.evaluate_license_status(payload, key_id, now=now)

        # If product is wrong or edition is wrong, reject replacement and preserve existing license
        if status_resp.status in (LicenseStatusEnum.INVALID_PRODUCT, LicenseStatusEnum.EDITION_MISMATCH):
            return False, status_resp

        # 3. Atomic persistence: Write to temporary file, then replace
        try:
            serialized_artifact = json.dumps(envelope, indent=2, ensure_ascii=False)
            tmp_path = self.storage_dir / f"active_license_{os.getpid()}_{datetime.now().timestamp()}.tmp"
            tmp_path.write_text(serialized_artifact, encoding="utf-8")
            os.replace(tmp_path, self.active_license_path)
        except Exception as exc:
            return False, LicenseStatusResponse(
                status=LicenseStatusEnum.UNSUPPORTED_LICENSE,
                is_valid=False,
                running_edition=running_edition,
                message=f"Failed to persist license file atomically: {exc}",
                error_code="PERSISTENCE_FAILED",
            )

        # 4. Re-read and re-verify from persisted file to guarantee end-to-end integrity
        persisted_status = self.get_status(now=now)
        return persisted_status.is_valid, persisted_status

    def _parse_incoming_artifact(
        self,
        artifact: Optional[Dict[str, Any]],
        artifact_text: Optional[str],
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if artifact is not None and isinstance(artifact, dict):
            return artifact, None

        if artifact_text is not None and isinstance(artifact_text, str):
            raw_text = artifact_text.strip()
            if len(raw_text.encode("utf-8")) > MAX_LICENSE_FILE_BYTES:
                return None, f"License file exceeds maximum allowed size of {MAX_LICENSE_FILE_BYTES // 1024} KB."
            try:
                parsed = json.loads(raw_text)
                if not isinstance(parsed, dict):
                    return None, "License artifact content must be a JSON object."
                return parsed, None
            except json.JSONDecodeError as exc:
                return None, f"Malformed JSON in license file: {exc}"

        return None, "No license artifact payload or text content provided."

    # --------------------------------------------------------------------------
    # Centralized Runtime Protected Operation Enforcement
    # --------------------------------------------------------------------------

    def require_valid_license(self, operation: str) -> LicenseStatusResponse:
        """Centralized check for protected operations (inspections, releases, pipeline executions).

        Raises HTTP 403 Forbidden with clear structured detail if license is invalid.
        """
        status_resp = self.get_status()
        if not status_resp.is_valid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": "LICENSE_REQUIRED",
                    "status": status_resp.status.value,
                    "operation": operation,
                    "running_edition": status_resp.running_edition,
                    "message": f"Operation '{operation}' is protected and requires a valid {status_resp.running_edition.title()} Edition license. Status: {status_resp.status.value}. {status_resp.message}",
                },
            )
        return status_resp


# Global singleton instance
license_service = LicenseService()
