# Bundled HTML parser

Bundled source: golang.org/x/net/html at v0.55.0. The separately imported atom
package is pinned to x/net v0.58.0 by go.mod/go.sum; its sources are unchanged
between these versions.
Original LICENSE and PATENTS are retained in this directory. The upstream atom
package is imported unchanged from golang.org/x/net/html/atom.

This copy contains two DOM compatibility fixes documented in ../../VENDOR_PATCHES.md:
attribute insertion order and literal comment entities. Bundle it as an internal
package so the corrections apply when another Go module imports readability-kit;
Go ignores vendor directories belonging to dependencies. Public extraction APIs
do not expose parser-specific types.

Upstream generator directives and source headers are preserved for provenance;
do not regenerate or update sources without reapplying patches and running the
strict differential suite. This copy does not change tokenizer security limits.
