"""Offline file/stdin CLI. Output replacement happens only after success."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

from . import __version__, extract_html


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(1, f"{self.prog}: error: {message}\n")


def main(argv: list[str] | None = None) -> int:
    parser = _Parser(prog="readability-kit", description="Extract static HTML without fetching resources.")
    parser.add_argument("input", help="UTF-8 HTML file, or - for stdin")
    parser.add_argument("--url", required=True)
    parser.add_argument("--engine", choices=("chromium", "mozilla"), default="chromium")
    parser.add_argument("--format", choices=("json", "html", "text"), default="json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args(argv)
    try:
        html = (sys.stdin.buffer.read().decode("utf-8-sig") if args.input == "-"
                else Path(args.input).read_text(encoding="utf-8-sig"))
        article = extract_html(html, url=args.url, engine=args.engine)
        if article is None:
            return 2
        output = (json.dumps(article.to_dict(camel_case=True), ensure_ascii=False, indent=2)
                  if args.format == "json" else article.content if args.format == "html" else article.text_content)
        output += "\n"
        if args.output is None:
            sys.stdout.buffer.write(output.encode("utf-8"))
        else:
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                                 dir=args.output.absolute().parent, delete=False) as stream:
                    temporary = stream.name
                    stream.write(output)
                os.replace(temporary, args.output)
            finally:
                if temporary is not None:
                    Path(temporary).unlink(missing_ok=True)
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"readability-kit: {error}", file=sys.stderr)
        return 1
