"""Upload validation helpers for resume/CV files."""
from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import HTTPException, UploadFile, status

try:
    HTTP_413 = status.HTTP_413_CONTENT_TOO_LARGE
except AttributeError:  # FastAPI/Starlette compatibility
    HTTP_413 = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


MAX_RESUME_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

ALLOWED_RESUME_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
}

ALLOWED_RESUME_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}

EXECUTABLE_SIGNATURES = (
    b"MZ",          # Windows PE/EXE/DLL
    b"\x7fELF",     # Linux ELF
    b"#!",          # shell/python executable scripts
    b"\xca\xfe\xba\xbe",  # Mach-O universal
    b"\xfe\xed\xfa\xce",  # Mach-O
    b"\xfe\xed\xfa\xcf",  # Mach-O 64-bit
)


@dataclass(frozen=True)
class ValidatedUpload:
    filename: str
    mime_type: str
    extension: str
    size_bytes: int


def _is_probably_doc(content: bytes) -> bool:
    # Legacy .doc files are OLE compound docs; .docx files are ZIP containers.
    return content.startswith(b"\xd0\xcf\x11\xe0") or content.startswith(b"PK\x03\x04")


def _magic_matches_mime(content: bytes, mime_type: str) -> bool:
    if mime_type == "application/pdf":
        return content.startswith(b"%PDF")
    if mime_type in {"application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}:
        return _is_probably_doc(content)
    if mime_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if mime_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


def validate_resume_upload(file: UploadFile, content: bytes) -> ValidatedUpload:
    filename = os.path.basename(file.filename or "resume")
    mime_type = (file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    extension = os.path.splitext(filename)[1].lower()
    size_bytes = len(content)

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume file is empty.")

    if size_bytes > MAX_RESUME_UPLOAD_BYTES:
        max_mb = MAX_RESUME_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=HTTP_413,
            detail=f"Resume file is too large. Maximum allowed size is {max_mb}MB.",
        )

    if mime_type not in ALLOWED_RESUME_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported resume file type. Upload PDF, DOC/DOCX, PNG, JPG, or WEBP only.",
        )

    if extension not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported resume file extension. Upload PDF, DOC/DOCX, PNG, JPG, JPEG, or WEBP only.",
        )

    first_bytes = content[:16]
    if any(first_bytes.startswith(signature) for signature in EXECUTABLE_SIGNATURES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Executable files are not allowed for resume upload.",
        )

    if not _magic_matches_mime(content, mime_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File contents do not match the declared file type. Please upload a valid PDF, DOC/DOCX, or supported image.",
        )

    return ValidatedUpload(filename=filename, mime_type=mime_type, extension=extension, size_bytes=size_bytes)
