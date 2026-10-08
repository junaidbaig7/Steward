"""Unit tests for natural-language query understanding (no database needed)."""
import pytest

from app.services.query_parser import BUDGET_MAX_PRICE, parse_query


@pytest.mark.parametrize(
    ("query", "max_price", "min_price"),
    [
        ("spicy chicken under 300 rupees", 300, None),
        ("something below ₹250", 250, None),
        ("biryani less than Rs. 400", 400, None),
        ("dinner between 200 and 350", 350, 200),
        ("paneer 300 or less", 300, None),
        ("premium dishes above 400", None, 400),
        ("healthy food that is not too expensive", BUDGET_MAX_PRICE, None),
        ("something cheesy for dinner", None, None),
    ],
)
def test_price_extraction(query, max_price, min_price):
    p = parse_query(query)
    assert p.max_price == max_price
    assert p.min_price == min_price


@pytest.mark.parametrize(
    ("query", "food_type"),
    [
        ("I want something spicy with chicken", "NON_VEG"),
        ("find vegetarian food that is healthy", "VEG"),
        ("pure veg thali", "VEG"),
        ("non-veg starters", "NON_VEG"),
        ("non veg curry", "NON_VEG"),
        ("prawn curry with coconut", "NON_VEG"),
        ("smoky eggplant", None),          # 'egg' inside 'eggplant' must not count
        ("something cheesy for dinner", None),
    ],
)
def test_food_type_detection(query, food_type):
    assert parse_query(query).food_type == food_type


def test_spice_levels():
    assert parse_query("spicy noodles").min_spice == 2
    assert parse_query("very spicy wings").min_spice == 3
    p = parse_query("something not too spicy for kids")
    assert p.max_spice == 1 and p.min_spice is None


def test_numbers_removed_from_embedding_text():
    p = parse_query("I want something spicy with chicken under 300 rupees")
    assert "300" not in p.semantic_text
    assert "chicken" in p.semantic_text and "spicy" in p.semantic_text


def test_detected_chips_explain_filters():
    keys = {d["key"] for d in parse_query("spicy chicken under ₹300").detected}
    assert keys == {"price", "food_type", "spice"}


def test_keywords_skip_filler_words():
    assert parse_query("I want something cheesy for dinner").keywords() == ["cheesy"]


@pytest.mark.parametrize(
    ("query", "category"),
    [
        ("something sweet after dinner", "Desserts"),
        ("a cold drink", "Beverages"),
        ("light soup for a cold evening", "Soups"),
        ("sweet and sour chicken", None),   # 'sweet' alone is not a dessert intent
        ("spicy chicken", None),
    ],
)
def test_category_intents(query, category):
    assert parse_query(query).category == category
