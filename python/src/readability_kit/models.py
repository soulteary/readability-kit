"""Stable, typed result objects for readability-kit."""
from dataclasses import asdict, dataclass
from typing import Literal

Engine = Literal["chromium", "mozilla"]

_ALIASES = {"text_content": "textContent", "site_name": "siteName", "published_time": "publishedTime"}


@dataclass(frozen=True)
class Article:
    title: str
    content: str
    text_content: str
    length: int
    url: str
    engine: Engine
    byline: str | None
    dir: str | None
    lang: str | None
    excerpt: str | None
    site_name: str | None
    published_time: str | None

    def to_dict(self, *, camel_case: bool = False) -> dict[str, object]:
        """Return all fields, retaining None metadata (JSON null)."""
        # Real extraction fields are immutable scalars: no recursive copying is
        # needed. Preserve asdict behavior for subclasses and manually supplied
        # mutable values, which dataclasses do not reject at construction time.
        if type(self) is not Article:
            fields = asdict(self)
        else:
            values = (self.title, self.content, self.text_content, self.length,
                      self.url, self.engine, self.byline, self.dir, self.lang,
                      self.excerpt, self.site_name, self.published_time)
            fields = (dict(zip(_FIELDS, values))
                      if all(type(value) in (str, int, type(None)) for value in values)
                      else asdict(self))
        if camel_case:
            return {_ALIASES.get(key, key): value for key, value in fields.items()}
        return fields

    @classmethod
    def _from_native(cls, value: dict) -> "Article":
        aliases = {value: key for key, value in _ALIASES.items()}
        return cls(**{aliases.get(key, key): value for key, value in value.items()})

_FIELDS = tuple(Article.__dataclass_fields__)
