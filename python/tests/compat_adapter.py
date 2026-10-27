"""Private one-request adapter for tools/compatibility.mjs.

API and readerability success cases cross the public Python interface. Invalid
JS options and raw cases use the core's separate JS-compatible test boundary.
"""
import json
import sys
from readability_kit import _native, extract_html, is_probably_readerable

request = json.load(sys.stdin)
reference = json.loads(_native.compatibility_request(json.dumps(request)))
if reference["status"] == "error" or request["layer"] == "raw":
    result = reference
else:
    mapping = {"charThreshold": "char_threshold", "maxElemsToParse": "max_elems_to_parse",
               "nbTopCandidates": "nb_top_candidates", "keepClasses": "keep_classes",
               "classesToPreserve": "classes_to_preserve", "disableJSONLD": "disable_json_ld",
               "linkDensityModifier": "link_density_modifier", "minContentLength": "min_content_length",
               "minScore": "min_score"}
    options = {mapping.get(k, k): v for k, v in request["options"].items() if k != "flattenShadowRoots"}
    if options.get("engine") is None:
        options.pop("engine", None)
    try:
        if request["layer"] == "readerable":
            article = is_probably_readerable(request["html"], **options)
        else:
            value = extract_html(request["html"], **options)
            article = None if value is None else value.to_dict(camel_case=True)
        result = {"status": "empty" if article is None else "ok", "article": article}
    except Exception as error:
        result = {"status": "error", "article": None, "error": str(error)}
print(json.dumps(result, ensure_ascii=False))
