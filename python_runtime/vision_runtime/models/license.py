"""Pydantic data models for NOVA Machine Vision Platform Licensing.

Matches the authoritative contract and canonical serialization from NOVA License Management.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class LicenseStatusEnum(str, Enum):
    NOT_ACTIVATED = "NOT_ACTIVATED"
    VALID = "VALID"
    NOT_YET_VALID = "NOT_YET_VALID"
    EXPIRED = "EXPIRED"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    INVALID_PRODUCT = "INVALID_PRODUCT"
    EDITION_MISMATCH = "EDITION_MISMATCH"
    UNSUPPORTED_LICENSE = "UNSUPPORTED_LICENSE"


class LicenseLimitsModel(BaseModel):
    max_devices: int = Field(default=1, ge=-1)
    max_concurrent_inspections: int = Field(default=1, ge=-1)
    total_inspection_quota: int = Field(default=-1, ge=-1)


class LicensePayloadModel(BaseModel):
    schema_version: str = Field(..., pattern=r"^1\.0$")
    license_id: str = Field(..., min_length=1)
    license_number: str = Field(..., min_length=1)
    customer_id: str = Field(..., min_length=1)
    customer_code: str = Field(..., min_length=1)
    customer_name: str = Field(..., min_length=1)
    product_id: str = Field(..., min_length=1)
    edition: str = Field(..., pattern=r"^(developer|production)$")
    license_type: str = Field(..., pattern=r"^(SUBSCRIPTION|PERPETUAL)$")
    issued_at: str = Field(..., min_length=1)
    not_before: str = Field(..., min_length=1)
    expires_at: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    limits: LicenseLimitsModel
    key_id: str = Field(..., min_length=1)


class SignedLicenseEnvelopeModel(BaseModel):
    artifact_format: str = Field(..., pattern=r"^NOVA-LICENSE-ENVELOPE-V1$")
    algorithm: str = Field(..., pattern=r"^Ed25519$")
    key_id: str = Field(..., min_length=1)
    payload: Dict[str, Any]
    signature: str = Field(..., min_length=1)


class LicenseStatusResponse(BaseModel):
    status: LicenseStatusEnum
    is_valid: bool
    edition: Optional[str] = None
    running_edition: str
    license_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_code: Optional[str] = None
    product_id: Optional[str] = None
    license_type: Optional[str] = None
    issued_at: Optional[str] = None
    not_before: Optional[str] = None
    expires_at: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    key_id: Optional[str] = None
    signature_verified: bool = False
    message: str
    error_code: Optional[str] = None


class LicenseDetailsResponse(BaseModel):
    has_license: bool
    status: LicenseStatusEnum
    is_valid: bool
    edition: Optional[str] = None
    running_edition: str
    license_id: Optional[str] = None
    license_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    product_id: Optional[str] = None
    license_type: Optional[str] = None
    issued_at: Optional[str] = None
    not_before: Optional[str] = None
    expires_at: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    limits: Optional[Dict[str, int]] = None
    key_id: Optional[str] = None
    key_fingerprint: Optional[str] = None
    signature_algorithm: Optional[str] = None
    signature_verified: bool = False
    persisted_path: Optional[str] = None
    message: str


class LicenseImportRequest(BaseModel):
    artifact: Optional[Dict[str, Any]] = None
    artifact_text: Optional[str] = None


class LicenseImportResponse(BaseModel):
    success: bool
    status: LicenseStatusEnum
    license_number: Optional[str] = None
    message: str
    details: Optional[LicenseStatusResponse] = None


class LicenseValidateRequest(BaseModel):
    artifact: Optional[Dict[str, Any]] = None
    artifact_text: Optional[str] = None


class LicenseValidateResponse(BaseModel):
    valid: bool
    status: LicenseStatusEnum
    reason: str
    license_number: Optional[str] = None
    edition: Optional[str] = None
    product_id: Optional[str] = None
    key_id: Optional[str] = None
    expires_at: Optional[str] = None
    features: List[str] = Field(default_factory=list)
