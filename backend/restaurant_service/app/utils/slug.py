import re
import unicodedata


def slugify(value: str) -> str:
    """'Wok & Roll!' -> 'wok-roll'"""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "restaurant"
