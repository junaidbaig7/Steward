"""Turns a natural-language food request into (a) structured SQL filters and
(b) cleaned text for the embedding model.

    "I want something spicy with chicken under 300 rupees"
      → filters:  max_price=300, food_type=NON_VEG, min_spice=2
      → text:     "something spicy with chicken"

Rule-based on purpose: predictable, fast, and easy to explain. Numbers and price
phrases are removed before embedding because embedding models represent
numeric constraints poorly — those are enforced exactly in SQL instead.
"""
import re
from dataclasses import dataclass, field

_NUM = r"(?:rs\.?|inr|₹)?\s*(\d{2,5})\s*(?:rs|rupees?|inr|/-|₹)?"

_PRICE_PATTERNS: list[tuple[str, str]] = [
    (rf"\bbetween\s+{_NUM}\s+(?:and|to|-)\s+{_NUM}", "range"),
    (rf"\b(?:under|below|less than|cheaper than|within|upto|up to|max(?:imum)?|not more than|<=?)\s*{_NUM}", "max"),
    (rf"{_NUM}\s*(?:or less|or below|and under|max)\b", "max"),
    (rf"\b(?:above|over|more than|at least|min(?:imum)?|>=?)\s*{_NUM}", "min"),
]

_BUDGET_WORDS = re.compile(
    r"\b(cheap|budget|affordable|inexpensive|not (?:too |very )?(?:expensive|costly|pricey)|pocket[- ]friendly|low[- ]cost)\b"
)
BUDGET_MAX_PRICE = 250  # what "cheap / not too expensive" means on this menu

_VEG_WORDS = re.compile(r"\b(?<!non[- ])(?<!non)(veg|vegetarian|vegan|pure veg|meatless|no meat|plant[- ]based)\b")
_NONVEG_WORDS = re.compile(
    r"\b(non[- ]?veg(?:etarian)?|chicken|mutton|lamb|meat|fish|prawns?|shrimp|seafood|egg|eggs|keema|kebab|salmon|beef|pork)\b"
)

_VERY_SPICY = re.compile(r"\b(very|extra|super|really) (spicy|hot)\b|\bfiery\b|\bvery hot\b")
_SPICY = re.compile(r"\b(spicy|hot and spicy|chilli|chili|fiery|masaledar|teekha)\b")
_MILD = re.compile(r"\b(not (?:too |very )?spicy|mild|less spicy|no spice|non[- ]spicy|bland)\b")

# Unambiguous meal-type intents → category filter (shown as a removable chip).
_CATEGORY_INTENTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(desserts?|something sweet|sweet tooth|sweets|mithai)\b"), "Desserts"),
    (re.compile(r"\b(drinks?|beverages?|smoothies?|juice|shake)\b"), "Beverages"),
    (re.compile(r"\b(soups?)\b"), "Soups"),
    (re.compile(r"\b(salads?)\b"), "Salads & Bowls"),
]

_FILLER = re.compile(
    r"\b(i want|i'd like|i would like|give me|show me|find me|find|looking for|i am looking for|i'm looking for|"
    r"can i get|please|some|something|anything|food|dish(?:es)?|rupees?|rs|inr)\b"
)


@dataclass
class ParsedQuery:
    original: str
    semantic_text: str
    min_price: float | None = None
    max_price: float | None = None
    food_type: str | None = None
    min_spice: int | None = None
    max_spice: int | None = None
    category: str | None = None
    detected: list[dict] = field(default_factory=list)  # [{key, label, source}] for UI chips

    def keywords(self) -> list[str]:
        """Meaningful words for the full-text half of hybrid search."""
        words = re.findall(r"[a-z]{3,}", _FILLER.sub(" ", self.semantic_text.lower()))
        stop = {"and", "with", "for", "the", "not", "too", "very", "that", "this", "from", "want", "like", "dinner",
                "lunch", "breakfast", "tonight", "today", "good", "nice", "tasty", "best", "expensive"}
        return [w for w in dict.fromkeys(words) if w not in stop][:8]


def parse_query(text: str) -> ParsedQuery:
    q = text.strip()
    low = q.lower().replace("₹ ", "₹")
    parsed = ParsedQuery(original=q, semantic_text=q)
    spans: list[tuple[int, int]] = []

    # 1) Price constraints
    for pattern, kind in _PRICE_PATTERNS:
        m = re.search(pattern, low)
        if not m:
            continue
        nums = [float(n) for n in m.groups() if n]
        if kind == "range" and len(nums) == 2:
            parsed.min_price, parsed.max_price = sorted(nums)
            parsed.detected.append({"key": "price", "label": f"₹{nums[0]:.0f}–₹{nums[1]:.0f}", "source": m.group(0)})
        elif kind == "max" and parsed.max_price is None:
            parsed.max_price = nums[0]
            parsed.detected.append({"key": "price", "label": f"Under ₹{nums[0]:.0f}", "source": m.group(0).strip()})
        elif kind == "min" and parsed.min_price is None:
            parsed.min_price = nums[0]
            parsed.detected.append({"key": "price", "label": f"Above ₹{nums[0]:.0f}", "source": m.group(0).strip()})
        spans.append(m.span())
    if parsed.max_price is None and (m := _BUDGET_WORDS.search(low)):
        parsed.max_price = BUDGET_MAX_PRICE
        parsed.detected.append({"key": "price", "label": f"Under ₹{BUDGET_MAX_PRICE}", "source": m.group(0)})
        spans.append(m.span())

    # 2) Veg / Non-veg — an explicit "veg" wins over ingredient words.
    if m := _VEG_WORDS.search(low):
        parsed.food_type = "VEG"
        parsed.detected.append({"key": "food_type", "label": "Veg only", "source": m.group(0)})
    elif m := _NONVEG_WORDS.search(low):
        parsed.food_type = "NON_VEG"
        parsed.detected.append({"key": "food_type", "label": "Non-veg", "source": m.group(0)})

    # 3) Spice level
    if m := _MILD.search(low):
        parsed.max_spice = 1
        parsed.detected.append({"key": "spice", "label": "Mild", "source": m.group(0)})
    elif m := _VERY_SPICY.search(low):
        parsed.min_spice = 3
        parsed.detected.append({"key": "spice", "label": "Very spicy", "source": m.group(0)})
    elif m := _SPICY.search(low):
        parsed.min_spice = 2
        parsed.detected.append({"key": "spice", "label": "Spicy", "source": m.group(0)})

    # 4) Meal type
    for pattern, category in _CATEGORY_INTENTS:
        if m := pattern.search(low):
            parsed.category = category
            parsed.detected.append({"key": "category", "label": category, "source": m.group(0)})
            break

    # 5) Text for the embedding: drop price phrases (numbers) but keep meaning words.
    cleaned = low
    for start, end in sorted(spans, reverse=True):
        cleaned = cleaned[:start] + " " + cleaned[end:]
    cleaned = re.sub(r"[₹\d]+", " ", cleaned)
    meaning = _FILLER.sub(" ", cleaned)                       # "i want … food" adds only noise
    meaning = re.sub(r"\b(that is|which is|and|with|for|a|an|the)\s*$", "", meaning.strip())
    meaning = re.sub(r"\s+", " ", meaning).strip(" ,.")
    parsed.semantic_text = meaning or re.sub(r"\s+", " ", cleaned).strip(" ,.") or q
    return parsed
