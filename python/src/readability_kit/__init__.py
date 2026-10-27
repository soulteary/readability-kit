"""Extract articles from static HTML without fetching resources or running scripts."""
import math
import sys
from collections.abc import Sequence

from . import _native
from .models import Article, Engine

__all__ = ["Article", "Engine", "ExtractionError", "extract_html", "is_probably_readerable"]
__version__ = _native.__version__


class ExtractionError(RuntimeError):
    """Native extraction failed after input validation."""


def _string(name: str, value: object) -> None:
    if not isinstance(value, str):
        raise TypeError(f"{name} must be a string")
    # Native UTF-8 strings cannot represent isolated surrogate code points.
    try:
        _native.validate_text(value)
    except UnicodeEncodeError as error:
        raise ValueError(f"{name} must not contain isolated Unicode surrogates") from error


def _integer(name: str, value: object, minimum: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    if not minimum <= value <= sys.maxsize:
        raise ValueError(f"{name} must be between {minimum} and {sys.maxsize}")


def _number(name: str, value: object, minimum: float | None = None) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{name} must be a number")
    try:
        valid = math.isfinite(value) and (minimum is None or value >= minimum)
    except OverflowError:
        valid = False
    if not valid:
        raise ValueError(f"{name} must be finite" + (f" and >= {minimum}" if minimum is not None else ""))


def _engine(value: Engine) -> None:
    _string("engine", value)
    if value not in ("chromium", "mozilla"):
        raise ValueError('engine must be "chromium" or "mozilla"')


def extract_html(
    html: str, *, url: str, engine: Engine = "chromium",
    char_threshold: int = 500, max_elems_to_parse: int = 0,
    nb_top_candidates: int = 5, keep_classes: bool = False,
    classes_to_preserve: Sequence[str] = (), disable_json_ld: bool = False,
    link_density_modifier: float = 0.0, sanitize: bool = True,
) -> Article | None:
    """Extract an article; return None when no article is found.

    URL must be absolute HTTP(S). length counts UTF-16 code units, not Python
    characters. HTML strings do not carry browser Shadow DOM.
    """
    _string("html", html)
    _string("url", url)
    _engine(engine)
    for name, value, minimum in (("char_threshold", char_threshold, 1),
                                  ("max_elems_to_parse", max_elems_to_parse, 0),
                                  ("nb_top_candidates", nb_top_candidates, 1)):
        _integer(name, value, minimum)
    for name, value in (("keep_classes", keep_classes), ("disable_json_ld", disable_json_ld), ("sanitize", sanitize)):
        if not isinstance(value, bool):
            raise TypeError(f"{name} must be a boolean")
    if isinstance(classes_to_preserve, (str, bytes)) or not isinstance(classes_to_preserve, Sequence):
        raise TypeError("classes_to_preserve must be a sequence of strings")
    classes = list(classes_to_preserve)
    for value in classes:
        _string("classes_to_preserve item", value)
    _number("link_density_modifier", link_density_modifier)
    if abs(link_density_modifier) > 3.4028234663852886e38:
        raise ValueError("link_density_modifier exceeds the native float32 range")
    options = dict(url=url, engine=engine, charThreshold=char_threshold,
                   maxElemsToParse=max_elems_to_parse, nbTopCandidates=nb_top_candidates,
                   keepClasses=keep_classes, classesToPreserve=classes,
                   disableJSONLD=disable_json_ld, linkDensityModifier=link_density_modifier,
                   sanitize=sanitize)
    try:
        result = _native.extract_article(html, options)
    except RuntimeError as error:
        raise ExtractionError(str(error)) from error
    return None if result is None else Article(*result)


def is_probably_readerable(
    html: str, *, engine: Engine = "chromium",
    min_content_length: int = 140, min_score: float = 20.0,
) -> bool:
    """Return an advisory heuristic; false does not rule out extraction."""
    _string("html", html)
    _engine(engine)
    _integer("min_content_length", min_content_length, 0)
    _number("min_score", min_score, 0)
    options = dict(engine=engine, minContentLength=min_content_length, minScore=min_score)
    try:
        return _native.readerable_direct(html, options)
    except RuntimeError as error:
        raise ExtractionError(str(error)) from error
