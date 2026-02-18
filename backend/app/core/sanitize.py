"""
입력 정제 공통 모듈 (XSS 방지·길이 제한).
엔드포인트에서 일관된 정제 정책 적용.
"""
import html
from typing import Optional


def sanitize_text(
    value: Optional[str],
    *,
    max_length: int = 500,
    allow_none: bool = True,
) -> Optional[str]:
    """
    사용자 입력 정제: HTML 이스케이프 + strip + 길이 제한.
    allow_none=True 이고 value가 비어 있으면 None 반환.
    """
    if value is None:
        return None if allow_none else ""
    sanitized = html.escape(value.strip())
    if not sanitized:
        return None if allow_none else ""
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    return sanitized


# 엔드포인트별 권장 길이 (일관성)
SEARCH_MAX_LENGTH = 100
QUESTION_MAX_LENGTH = 500
