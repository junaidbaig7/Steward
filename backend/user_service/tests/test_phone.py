"""Mobile numbers are normalised to E.164 before they reach Redis or PostgreSQL."""
import pytest

from app.schemas.auth import normalize_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9876543210", "+919876543210"),
        ("98765 43210", "+919876543210"),
        ("09876543210", "+919876543210"),
        ("+91 98765-43210", "+919876543210"),
        ("919876543210", "+919876543210"),
        ("+14155552671", "+14155552671"),
    ],
)
def test_valid_numbers(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["12345", "abcdefghij", "", "5876543210"])
def test_invalid_numbers(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)
