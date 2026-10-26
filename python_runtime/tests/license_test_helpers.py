"""Test helpers for generating cryptographically signed license test fixtures.

Only used during automated pytest test runs.
"""

import base64
import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from vision_runtime.services.license_service import (
    ARTIFACT_FORMAT_V1,
    ALGORITHM_ED25519,
    PAYLOAD_SCHEMA_VERSION,
    PRODUCT_ID_MVP,
    canonicalize_payload,
    format_utc_timestamp,
)

# Optional local dev private key path from license_platform
_DEV_KEY_PATH = Path(r"C:\project\license_platform\backend\keys\nova-key-2026-01_private.pem")


def get_official_dev_key() -> Optional[Ed25519PrivateKey]:
    if _DEV_KEY_PATH.is_file():
        try:
            pem_bytes = _DEV_KEY_PATH.read_bytes()
            key = serialization.load_pem_private_key(pem_bytes, password=None)
            if isinstance(key, Ed25519PrivateKey):
                return key
        except Exception:
            pass
    return None


def generate_test_keypair() -> Tuple[Ed25519PrivateKey, str]:
    """Generates an ephemeral Ed25519 key pair for tests. Returns (private_key, public_pem)."""
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return priv, pub_pem


def create_signed_license_artifact(
    edition: str = "developer",
    product_id: str = PRODUCT_ID_MVP,
    license_type: str = "SUBSCRIPTION",
    key_id: str = "nova-key-2026-01",
    private_key: Optional[Ed25519PrivateKey] = None,
    is_expired: bool = False,
    is_not_yet_valid: bool = False,
    license_number: str = "NVL-TEST-0001",
    customer_code: str = "TEST-CORP",
    customer_name: str = "Test Corporation",
    features: Optional[list] = None,
    limits: Optional[dict] = None,
    tamper_payload: bool = False,
    tamper_signature: bool = False,
) -> Dict[str, Any]:
    """Creates a cryptographically signed license envelope fixture."""
    if private_key is None:
        if key_id == "nova-key-2026-01":
            dev_key = get_official_dev_key()
            if dev_key is not None:
                private_key = dev_key
            else:
                private_key, _ = generate_test_keypair()
        else:
            private_key, _ = generate_test_keypair()

    now = datetime.now(timezone.utc)
    if is_not_yet_valid:
        not_before = now + timedelta(days=10)
        expires_at = now + timedelta(days=365)
    elif is_expired:
        not_before = now - timedelta(days=60)
        expires_at = now - timedelta(days=1)
    else:
        not_before = now - timedelta(days=1)
        expires_at = now + timedelta(days=365) if license_type == "SUBSCRIPTION" else None

    payload: Dict[str, Any] = {
        "schema_version": PAYLOAD_SCHEMA_VERSION,
        "license_id": f"lic-{license_number.lower()}",
        "license_number": license_number,
        "customer_id": f"cust-{customer_code.lower()}",
        "customer_code": customer_code,
        "customer_name": customer_name,
        "product_id": product_id,
        "edition": edition,
        "license_type": license_type,
        "issued_at": format_utc_timestamp(now - timedelta(days=2)),
        "not_before": format_utc_timestamp(not_before),
        "expires_at": format_utc_timestamp(expires_at),
        "features": features if features is not None else ["*"],
        "limits": limits if limits is not None else {
            "max_devices": 2,
            "max_concurrent_inspections": 2,
            "total_inspection_quota": -1,
        },
        "key_id": key_id,
    }

    canonical_bytes = canonicalize_payload(payload)
    sig_bytes = private_key.sign(canonical_bytes)

    if tamper_signature:
        # Flip the last byte of the signature
        mutated = bytearray(sig_bytes)
        mutated[-1] = (mutated[-1] ^ 0xFF)
        sig_bytes = bytes(mutated)

    sig_b64 = base64.b64encode(sig_bytes).decode("ascii")

    envelope = {
        "artifact_format": ARTIFACT_FORMAT_V1,
        "algorithm": ALGORITHM_ED25519,
        "key_id": key_id,
        "payload": copy.deepcopy(payload),
        "signature": sig_b64,
    }

    if tamper_payload:
        envelope["payload"]["customer_name"] = "Tampered Company Name"

    return envelope
