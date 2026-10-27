// SPDX-License-Identifier: Apache-2.0
// DOMPurify policy tables adapted from DOMPurify 3.4.17 (Apache-2.0 OR MPL-2.0).
// Tag tables use HTML-mode lowercase lookup keys, including SVG filter names.
use dom_query::{Document, NodeData, NodeRef};
const ALLOWED: &[&str] = &[
    "a",
    "abbr",
    "acronym",
    "address",
    "altglyph",
    "altglyphdef",
    "altglyphitem",
    "animatecolor",
    "animatemotion",
    "animatetransform",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "bdi",
    "bdo",
    "big",
    "blink",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "center",
    "circle",
    "cite",
    "clippath",
    "code",
    "col",
    "colgroup",
    "content",
    "data",
    "datalist",
    "dd",
    "decorator",
    "defs",
    "del",
    "desc",
    "details",
    "dfn",
    "dialog",
    "dir",
    "div",
    "dl",
    "dt",
    "element",
    "ellipse",
    "em",
    "enterkeyhint",
    "exportparts",
    "feblend",
    "fecolormatrix",
    "fecomponenttransfer",
    "fecomposite",
    "feconvolvematrix",
    "fediffuselighting",
    "fedisplacementmap",
    "fedistantlight",
    "fedropshadow",
    "feflood",
    "fefunca",
    "fefuncb",
    "fefuncg",
    "fefuncr",
    "fegaussianblur",
    "feimage",
    "femerge",
    "femergenode",
    "femorphology",
    "feoffset",
    "fepointlight",
    "fespecularlighting",
    "fespotlight",
    "fetile",
    "feturbulence",
    "fieldset",
    "figcaption",
    "figure",
    "filter",
    "font",
    "footer",
    "form",
    "g",
    "glyph",
    "glyphref",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hgroup",
    "hkern",
    "hr",
    "html",
    "i",
    "image",
    "img",
    "input",
    "inputmode",
    "ins",
    "kbd",
    "label",
    "legend",
    "li",
    "line",
    "lineargradient",
    "main",
    "map",
    "mark",
    "marker",
    "marquee",
    "mask",
    "math",
    "menclose",
    "menu",
    "menuitem",
    "merror",
    "metadata",
    "meter",
    "mfenced",
    "mfrac",
    "mglyph",
    "mi",
    "mlabeledtr",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mpath",
    "mphantom",
    "mprescripts",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "nav",
    "nobr",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "part",
    "path",
    "pattern",
    "picture",
    "polygon",
    "polyline",
    "pre",
    "progress",
    "q",
    "radialgradient",
    "rect",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "search",
    "section",
    "select",
    "shadow",
    "slot",
    "small",
    "source",
    "spacer",
    "span",
    "stop",
    "strike",
    "strong",
    "style",
    "sub",
    "summary",
    "sup",
    "svg",
    "switch",
    "symbol",
    "table",
    "tbody",
    "td",
    "template",
    "text",
    "textarea",
    "textpath",
    "tfoot",
    "th",
    "thead",
    "time",
    "title",
    "tr",
    "track",
    "tref",
    "tspan",
    "tt",
    "u",
    "ul",
    "var",
    "video",
    "view",
    "vkern",
    "wbr",
];
const ATTRS: &[&str] = &[
    "accent",
    "accent-height",
    "accentunder",
    "accept",
    "accumulate",
    "action",
    "additive",
    "align",
    "alignment-baseline",
    "alt",
    "amplitude",
    "ascent",
    "attributename",
    "attributetype",
    "autocapitalize",
    "autocomplete",
    "autopictureinpicture",
    "autoplay",
    "azimuth",
    "background",
    "basefrequency",
    "baseline-shift",
    "begin",
    "bevelled",
    "bgcolor",
    "bias",
    "border",
    "by",
    "capture",
    "cellpadding",
    "cellspacing",
    "checked",
    "cite",
    "class",
    "clear",
    "clip",
    "clip-path",
    "clip-rule",
    "clippathunits",
    "close",
    "color",
    "color-interpolation",
    "color-interpolation-filters",
    "color-profile",
    "color-rendering",
    "cols",
    "colspan",
    "columnalign",
    "columnlines",
    "columnspacing",
    "columnspan",
    "command",
    "commandfor",
    "controls",
    "controlslist",
    "coords",
    "crossorigin",
    "cx",
    "cy",
    "d",
    "datetime",
    "decoding",
    "default",
    "denomalign",
    "depth",
    "diffuseconstant",
    "dir",
    "direction",
    "disabled",
    "disablepictureinpicture",
    "disableremoteplayback",
    "display",
    "displaystyle",
    "divisor",
    "dominant-baseline",
    "download",
    "draggable",
    "dur",
    "dx",
    "dy",
    "edgemode",
    "elevation",
    "encoding",
    "enctype",
    "end",
    "enterkeyhint",
    "exponent",
    "exportparts",
    "face",
    "fence",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "filterunits",
    "flood-color",
    "flood-opacity",
    "font-family",
    "font-size",
    "font-size-adjust",
    "font-stretch",
    "font-style",
    "font-variant",
    "font-weight",
    "for",
    "frame",
    "fx",
    "fy",
    "g1",
    "g2",
    "glyph-name",
    "glyphref",
    "gradienttransform",
    "gradientunits",
    "headers",
    "height",
    "hidden",
    "high",
    "href",
    "hreflang",
    "id",
    "image-rendering",
    "in",
    "in2",
    "inert",
    "inputmode",
    "integrity",
    "intercept",
    "ismap",
    "k",
    "k1",
    "k2",
    "k3",
    "k4",
    "kernelmatrix",
    "kernelunitlength",
    "kerning",
    "keypoints",
    "keysplines",
    "keytimes",
    "kind",
    "label",
    "lang",
    "largeop",
    "length",
    "lengthadjust",
    "letter-spacing",
    "lighting-color",
    "linethickness",
    "list",
    "loading",
    "local",
    "loop",
    "low",
    "lquote",
    "lspace",
    "marker-end",
    "marker-mid",
    "marker-start",
    "markerheight",
    "markerunits",
    "markerwidth",
    "mask",
    "mask-type",
    "maskcontentunits",
    "maskunits",
    "mathbackground",
    "mathcolor",
    "mathsize",
    "mathvariant",
    "max",
    "maxlength",
    "maxsize",
    "media",
    "method",
    "min",
    "minlength",
    "minsize",
    "mode",
    "movablelimits",
    "multiple",
    "muted",
    "name",
    "nonce",
    "noshade",
    "notation",
    "novalidate",
    "nowrap",
    "numalign",
    "numoctaves",
    "offset",
    "opacity",
    "open",
    "operator",
    "optimum",
    "order",
    "orient",
    "orientation",
    "origin",
    "overflow",
    "paint-order",
    "part",
    "path",
    "pathlength",
    "pattern",
    "patterncontentunits",
    "patterntransform",
    "patternunits",
    "placeholder",
    "playsinline",
    "pointer-events",
    "points",
    "popover",
    "popovertarget",
    "popovertargetaction",
    "poster",
    "preload",
    "preservealpha",
    "preserveaspectratio",
    "primitiveunits",
    "pubdate",
    "r",
    "radiogroup",
    "radius",
    "readonly",
    "refx",
    "refy",
    "rel",
    "repeatcount",
    "repeatdur",
    "required",
    "restart",
    "result",
    "rev",
    "reversed",
    "role",
    "rotate",
    "rowalign",
    "rowlines",
    "rows",
    "rowspacing",
    "rowspan",
    "rquote",
    "rspace",
    "rx",
    "ry",
    "scale",
    "scope",
    "scriptlevel",
    "scriptminsize",
    "scriptsizemultiplier",
    "seed",
    "selected",
    "selection",
    "separator",
    "separators",
    "shape",
    "shape-rendering",
    "size",
    "sizes",
    "slope",
    "slot",
    "span",
    "specularconstant",
    "specularexponent",
    "spellcheck",
    "spreadmethod",
    "src",
    "srclang",
    "srcset",
    "start",
    "startoffset",
    "stddeviation",
    "step",
    "stitchtiles",
    "stop-color",
    "stop-opacity",
    "stretchy",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "style",
    "subscriptshift",
    "summary",
    "supscriptshift",
    "surfacescale",
    "symmetric",
    "systemlanguage",
    "tabindex",
    "tablevalues",
    "targetx",
    "targety",
    "text-anchor",
    "text-decoration",
    "text-orientation",
    "text-rendering",
    "textlength",
    "title",
    "transform",
    "transform-origin",
    "translate",
    "type",
    "u1",
    "u2",
    "unicode",
    "usemap",
    "valign",
    "value",
    "values",
    "vector-effect",
    "version",
    "vert-adv-y",
    "vert-origin-x",
    "vert-origin-y",
    "viewbox",
    "visibility",
    "voffset",
    "width",
    "word-spacing",
    "wrap",
    "writing-mode",
    "x",
    "x1",
    "x2",
    "xchannelselector",
    "xlink:href",
    "xlink:title",
    "xml:id",
    "xml:space",
    "xmlns",
    "xmlns:xlink",
    "y",
    "y1",
    "y2",
    "ychannelselector",
    "z",
    "zoomandpan",
];
const SVG: &[&str] = &[
    "a",
    "altglyph",
    "altglyphdef",
    "altglyphitem",
    "animate",
    "animatecolor",
    "animatemotion",
    "animatetransform",
    "circle",
    "clippath",
    "color-profile",
    "cursor",
    "defs",
    "desc",
    "discard",
    "ellipse",
    "enterkeyhint",
    "exportparts",
    "feblend",
    "fecolormatrix",
    "fecomponenttransfer",
    "fecomposite",
    "feconvolvematrix",
    "fediffuselighting",
    "fedisplacementmap",
    "fedistantlight",
    "fedropshadow",
    "feflood",
    "fefunca",
    "fefuncb",
    "fefuncg",
    "fefuncr",
    "fegaussianblur",
    "feimage",
    "femerge",
    "femergenode",
    "femorphology",
    "feoffset",
    "fepointlight",
    "fespecularlighting",
    "fespotlight",
    "fetile",
    "feturbulence",
    "filter",
    "font",
    "font-face",
    "font-face-format",
    "font-face-name",
    "font-face-src",
    "font-face-uri",
    "foreignobject",
    "g",
    "glyph",
    "glyphref",
    "hatch",
    "hatchpath",
    "hkern",
    "image",
    "inputmode",
    "line",
    "lineargradient",
    "marker",
    "mask",
    "mesh",
    "meshgradient",
    "meshpatch",
    "meshrow",
    "metadata",
    "missing-glyph",
    "mpath",
    "part",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialgradient",
    "rect",
    "script",
    "set",
    "solidcolor",
    "stop",
    "style",
    "svg",
    "switch",
    "symbol",
    "text",
    "textpath",
    "title",
    "tref",
    "tspan",
    "unknown",
    "use",
    "view",
    "vkern",
];
const MATH: &[&str] = &[
    "annotation",
    "annotation-xml",
    "maction",
    "maligngroup",
    "malignmark",
    "math",
    "menclose",
    "merror",
    "mfenced",
    "mfrac",
    "mglyph",
    "mi",
    "mlabeledtr",
    "mlongdiv",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mprescripts",
    "mroot",
    "mrow",
    "ms",
    "mscarries",
    "mscarry",
    "msgroup",
    "msline",
    "mspace",
    "msqrt",
    "msrow",
    "mstack",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "none",
    "semantics",
];
const FORBIDDEN: &[&str] = &[
    "button", "form", "input", "option", "select", "style", "textarea",
];
const DROP: &[&str] = &[
    "annotation-xml",
    "audio",
    "colgroup",
    "desc",
    "foreignobject",
    "head",
    "iframe",
    "math",
    "mi",
    "mn",
    "mo",
    "ms",
    "mtext",
    "noembed",
    "noframes",
    "noscript",
    "plaintext",
    "script",
    "selectedcontent",
    "style",
    "svg",
    "template",
    "thead",
    "title",
    "video",
    "xmp",
];
const URISAFE: &[&str] = &[
    "alt",
    "class",
    "for",
    "id",
    "label",
    "name",
    "pattern",
    "placeholder",
    "role",
    "style",
    "summary",
    "title",
    "value",
    "xmlns",
];
const DATAURI: &[&str] = &["audio", "image", "img", "source", "track", "video"];
const COMMON: &[&str] = &["a", "font", "script", "style", "title"];
const MATHINTEGRATION: &[&str] = &["mi", "mn", "mo", "ms", "mtext"];
const CLOBBERNAMES: &[&str] = &[
    "ATTRIBUTE_NODE",
    "CDATA_SECTION_NODE",
    "COMMENT_NODE",
    "DOCUMENT_FRAGMENT_NODE",
    "DOCUMENT_NODE",
    "DOCUMENT_POSITION_CONTAINED_BY",
    "DOCUMENT_POSITION_CONTAINS",
    "DOCUMENT_POSITION_DISCONNECTED",
    "DOCUMENT_POSITION_FOLLOWING",
    "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC",
    "DOCUMENT_POSITION_PRECEDING",
    "DOCUMENT_TYPE_NODE",
    "ELEMENT_NODE",
    "ENTITY_NODE",
    "ENTITY_REFERENCE_NODE",
    "NOTATION_NODE",
    "PROCESSING_INSTRUCTION_NODE",
    "TEXT_NODE",
    "URL",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
    "acceptCharset",
    "accessKey",
    "action",
    "activeElement",
    "addEventListener",
    "adoptNode",
    "after",
    "anchors",
    "append",
    "appendChild",
    "applets",
    "ariaAtomic",
    "ariaAutoComplete",
    "ariaBusy",
    "ariaChecked",
    "ariaColCount",
    "ariaColIndex",
    "ariaColIndexText",
    "ariaColSpan",
    "ariaCurrent",
    "ariaDescription",
    "ariaDisabled",
    "ariaExpanded",
    "ariaHasPopup",
    "ariaHidden",
    "ariaInvalid",
    "ariaKeyShortcuts",
    "ariaLabel",
    "ariaLevel",
    "ariaLive",
    "ariaModal",
    "ariaMultiLine",
    "ariaMultiSelectable",
    "ariaOrientation",
    "ariaPlaceholder",
    "ariaPosInSet",
    "ariaPressed",
    "ariaReadOnly",
    "ariaRelevant",
    "ariaRequired",
    "ariaRoleDescription",
    "ariaRowCount",
    "ariaRowIndex",
    "ariaRowIndexText",
    "ariaRowSpan",
    "ariaSelected",
    "ariaSetSize",
    "ariaSort",
    "ariaValueMax",
    "ariaValueMin",
    "ariaValueNow",
    "ariaValueText",
    "assignedSlot",
    "attachInternals",
    "attachShadow",
    "attributes",
    "baseURI",
    "before",
    "blur",
    "body",
    "captureEvents",
    "characterSet",
    "charset",
    "checkValidity",
    "childElementCount",
    "childNodes",
    "children",
    "classList",
    "className",
    "clear",
    "click",
    "clientHeight",
    "clientLeft",
    "clientTop",
    "clientWidth",
    "cloneNode",
    "close",
    "closest",
    "compareDocumentPosition",
    "compatMode",
    "constructor",
    "contains",
    "contentType",
    "cookie",
    "createAttribute",
    "createAttributeNS",
    "createCDATASection",
    "createComment",
    "createDocumentFragment",
    "createElement",
    "createElementNS",
    "createEvent",
    "createExpression",
    "createNSResolver",
    "createNodeIterator",
    "createProcessingInstruction",
    "createRange",
    "createTextNode",
    "createTreeWalker",
    "currentScript",
    "dataset",
    "defaultView",
    "dir",
    "dispatchEvent",
    "doctype",
    "documentElement",
    "documentURI",
    "draggable",
    "elements",
    "embeds",
    "enctype",
    "evaluate",
    "firstChild",
    "firstElementChild",
    "focus",
    "forms",
    "getAttribute",
    "getAttributeNS",
    "getAttributeNames",
    "getAttributeNode",
    "getAttributeNodeNS",
    "getBoundingClientRect",
    "getClientRects",
    "getElementById",
    "getElementsByClassName",
    "getElementsByName",
    "getElementsByTagName",
    "getElementsByTagNameNS",
    "getRootNode",
    "getSelection",
    "hasAttribute",
    "hasAttributeNS",
    "hasAttributes",
    "hasChildNodes",
    "hasFocus",
    "hasOwnProperty",
    "head",
    "hidden",
    "id",
    "images",
    "implementation",
    "importNode",
    "innerHTML",
    "inputEncoding",
    "insertAdjacentElement",
    "insertAdjacentHTML",
    "insertAdjacentText",
    "insertBefore",
    "isConnected",
    "isDefaultNamespace",
    "isEqualNode",
    "isPrototypeOf",
    "isSameNode",
    "lang",
    "lastChild",
    "lastElementChild",
    "lastModified",
    "length",
    "links",
    "localName",
    "location",
    "lookupNamespaceURI",
    "lookupPrefix",
    "matches",
    "method",
    "name",
    "namespaceURI",
    "nextElementSibling",
    "nextSibling",
    "noValidate",
    "nodeName",
    "nodeType",
    "nodeValue",
    "nonce",
    "normalize",
    "offsetHeight",
    "offsetLeft",
    "offsetParent",
    "offsetTop",
    "offsetWidth",
    "onabort",
    "onauxclick",
    "onbeforeinput",
    "onbeforematch",
    "onbeforetoggle",
    "onblur",
    "oncancel",
    "oncanplay",
    "oncanplaythrough",
    "onchange",
    "onclick",
    "onclose",
    "oncontextlost",
    "oncontextmenu",
    "oncontextrestored",
    "oncopy",
    "oncuechange",
    "oncut",
    "ondblclick",
    "ondrag",
    "ondragend",
    "ondragenter",
    "ondragleave",
    "ondragover",
    "ondragstart",
    "ondrop",
    "ondurationchange",
    "onemptied",
    "onended",
    "onerror",
    "onfocus",
    "onformdata",
    "ongotpointercapture",
    "oninput",
    "oninvalid",
    "onkeydown",
    "onkeypress",
    "onkeyup",
    "onload",
    "onloadeddata",
    "onloadedmetadata",
    "onloadstart",
    "onlostpointercapture",
    "onmousedown",
    "onmouseenter",
    "onmouseleave",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
    "onpaste",
    "onpause",
    "onplay",
    "onplaying",
    "onpointercancel",
    "onpointerdown",
    "onpointerenter",
    "onpointerleave",
    "onpointermove",
    "onpointerout",
    "onpointerover",
    "onpointerrawupdate",
    "onpointerup",
    "onprogress",
    "onratechange",
    "onreadystatechange",
    "onreset",
    "onresize",
    "onscroll",
    "onscrollend",
    "onsecuritypolicyviolation",
    "onseeked",
    "onseeking",
    "onselect",
    "onslotchange",
    "onstalled",
    "onsubmit",
    "onsuspend",
    "ontimeupdate",
    "ontoggle",
    "ontouchcancel",
    "ontouchend",
    "ontouchmove",
    "ontouchstart",
    "onvisibilitychange",
    "onvolumechange",
    "onwaiting",
    "onwebkitanimationend",
    "onwebkitanimationiteration",
    "onwebkitanimationstart",
    "onwebkittransitionend",
    "onwheel",
    "open",
    "outerHTML",
    "ownerDocument",
    "parentElement",
    "parentNode",
    "plugins",
    "prefix",
    "prepend",
    "previousElementSibling",
    "previousSibling",
    "propertyIsEnumerable",
    "querySelector",
    "querySelectorAll",
    "readyState",
    "referrer",
    "releaseEvents",
    "remove",
    "removeAttribute",
    "removeAttributeNS",
    "removeAttributeNode",
    "removeChild",
    "removeEventListener",
    "replaceChild",
    "replaceChildren",
    "replaceWith",
    "reportValidity",
    "requestSubmit",
    "reset",
    "role",
    "scripts",
    "scrollHeight",
    "scrollLeft",
    "scrollTop",
    "scrollWidth",
    "setAttribute",
    "setAttributeNS",
    "setAttributeNode",
    "setAttributeNodeNS",
    "shadowRoot",
    "slot",
    "style",
    "styleSheets",
    "submit",
    "tabIndex",
    "tagName",
    "target",
    "textContent",
    "title",
    "toLocaleString",
    "toString",
    "toggleAttribute",
    "translate",
    "valueOf",
    "visibilityState",
    "webkitMatchesSelector",
    "write",
    "writeln",
];
const INLINE: &[&str] = &["b", "em", "i", "span", "strong"];
const EMPTY: &[&str] = &[
    "article",
    "aside",
    "b",
    "div",
    "em",
    "figcaption",
    "figure",
    "footer",
    "header",
    "i",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "section",
    "span",
    "strong",
    "ul",
];
const MEDIA: &[&str] = &[
    "audio", "canvas", "iframe", "img", "math", "picture", "svg", "video",
];

// Share one lookup routine across sanitizer and serializer call sites.
#[inline(never)]
fn has(set: &[&str], value: &str) -> bool {
    set.binary_search(&value).is_ok()
}
fn trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}
pub(crate) fn exact_text(n: NodeRef<'_>) -> String {
    let mut out = String::new();
    text_into(n, &mut out);
    out
}
fn text_into(n: NodeRef<'_>, out: &mut String) {
    n.query(|n| {
        if let NodeData::Text { contents } = &n.data {
            out.push_str(contents.as_ref())
        }
    });
    for c in n.children() {
        text_into(c, out)
    }
}
fn tag(n: NodeRef<'_>) -> String {
    n.node_name()
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default()
}
fn namespace(n: NodeRef<'_>) -> String {
    n.query(|n| match &n.data {
        NodeData::Element(e) => e.name.ns.to_string(),
        _ => String::new(),
    })
    .unwrap_or_default()
}
fn ns_valid(n: NodeRef<'_>) -> bool {
    let t = tag(n);
    let Some(p) = n.parent() else { return false };
    let pt = tag(p);
    let ns = namespace(n);
    let pn = namespace(p);
    match ns.as_str() {
        "http://www.w3.org/2000/svg" => {
            if pn == "http://www.w3.org/1999/xhtml" {
                t == "svg"
            } else if pn == "http://www.w3.org/1998/Math/MathML" {
                t == "svg" && (pt == "annotation-xml" || has(MATHINTEGRATION, &pt))
            } else {
                has(SVG, &t)
            }
        }
        "http://www.w3.org/1998/Math/MathML" => {
            if pn == "http://www.w3.org/1999/xhtml" {
                t == "math"
            } else if pn == "http://www.w3.org/2000/svg" {
                t == "math" && pt == "annotation-xml"
            } else {
                has(MATH, &t)
            }
        }
        "http://www.w3.org/1999/xhtml" => {
            if pn == "http://www.w3.org/2000/svg" && pt != "annotation-xml" {
                return false;
            }
            if pn == "http://www.w3.org/1998/Math/MathML" && !has(MATHINTEGRATION, &pt) {
                return false;
            }
            !has(MATH, &t) && (has(COMMON, &t) || !has(SVG, &t))
        }
        _ => false,
    }
}
fn custom_attr(k: &str, prefix: &str) -> bool {
    k.strip_prefix(prefix).is_some_and(|s| {
        !s.is_empty()
            && s.chars().all(|c| {
                c.is_alphanumeric()
                    || c == '_'
                    || c == '-'
                    || (prefix == "data-" && (c == '.' || c == '\u{b7}'))
            })
    })
}
fn safe_uri(v: &str) -> bool {
    let v: String = v
        .chars()
        .filter(|&c| {
            !(c <= ' '
                || matches!(
                    c,
                    '\u{a0}' | '\u{1680}' | '\u{180e}' | '\u{2000}'
                        ..='\u{2029}' | '\u{205f}' | '\u{3000}'
                ))
        })
        .collect();
    let v = v.to_ascii_lowercase();
    if let Some((scheme, _)) = v.split_once(':') {
        if has(
            &[
                "callto", "cid", "ftp", "ftps", "http", "https", "mailto", "matrix", "sms", "tel",
                "xmpp",
            ],
            scheme,
        ) {
            return true;
        }
    }
    let mut chars = v.chars();
    let Some(first) = chars.next() else {
        return true;
    };
    if !first.is_ascii_alphabetic() {
        return true;
    }
    for c in chars {
        if !(c.is_ascii_alphabetic() || matches!(c, '+' | '.' | '-')) {
            return c != ':';
        }
    }
    true
}
fn unsafe_attr(v: &str) -> bool {
    let v = v.to_ascii_lowercase();
    v.contains("-->")
        || v.contains("--!>")
        || v.contains("]>")
        || [
            "style", "script", "title", "xmp", "textarea", "noscript", "iframe", "noembed",
            "noframes",
        ]
        .iter()
        .any(|s| v.contains(&format!("</{s}")))
}
fn sanitize_node(parent: NodeRef<'_>) {
    for n in parent.children() {
        sanitize_one(n)
    }
}
fn sanitize_one(n: NodeRef<'_>) {
    if n.is_comment() || n.is_doctype() {
        n.remove_from_parent();
        return;
    }
    if !n.is_element() {
        return;
    }
    let t = tag(n);
    if !has(ALLOWED, &t) || has(FORBIDDEN, &t) {
        if !has(DROP, &t) {
            for c in n.children() {
                c.remove_from_parent();
                n.insert_before(&c);
                sanitize_one(c)
            }
        }
        n.remove_from_parent();
        return;
    }
    if !ns_valid(n) {
        n.remove_from_parent();
        return;
    }
    n.update(|n| {
        if let NodeData::Element(e) = &mut n.data {
            e.attrs.retain_mut(|a| {
                let mut key = a.name.local.as_ref().to_ascii_lowercase();
                if let Some(prefix) = a.name.prefix.as_ref().filter(|p| !p.is_empty()) {
                    key = format!("{prefix}:{key}")
                };
                let val = if key == "value" {
                    a.value.to_string()
                } else {
                    trim(&a.value).to_string()
                };
                let custom = custom_attr(&key, "data-") || custom_attr(&key, "aria-");
                if key == "style"
                    || unsafe_attr(&val)
                    || (key == "attributename" && val.contains("href"))
                    || (!has(ATTRS, &key) && !custom)
                    || ((key == "id" || key == "name") && has(CLOBBERNAMES, &val))
                {
                    return false;
                }
                let safe = has(URISAFE, &key)
                    || custom
                    || val.is_empty()
                    || safe_uri(&val)
                    || (has(&["href", "src", "xlink:href"], &key)
                        && has(DATAURI, &t)
                        && val.starts_with("data:"));
                if safe {
                    a.value = val.into()
                }
                safe
            })
        }
    });
    sanitize_node(n)
}
fn media(n: NodeRef<'_>) -> bool {
    has(MEDIA, &tag(n)) || n.children().into_iter().any(media)
}
fn clean(root: NodeRef<'_>) {
    for n in root.descendants() {
        if !n.is_element() || !n.ancestors(None).iter().any(|p| p.id == root.id) {
            continue;
        }
        let raw = exact_text(n);
        let text = trim(&raw);
        let m = media(n);
        let announce = n
            .attr("aria-live")
            .is_some_and(|s| has(&["assertive", "polite"], &s))
            || n.attr("role")
                .is_some_and(|s| has(&["alert", "log", "status"], &s));
        if !m
            && ((announce && text.encode_utf16().count() < 200)
                || matches!(
                    text.to_lowercase().as_str(),
                    "advertisement" | "sponsored" | "supported by" | "skip advertisement"
                ))
        {
            n.remove_from_parent();
            continue;
        }
        let t = tag(n);
        if !has(EMPTY, &t) || !text.is_empty() || m {
            continue;
        }
        if has(INLINE, &t)
            && !raw.is_empty()
            && n.prev_sibling()
                .is_some_and(|s| !trim(&exact_text(s)).is_empty())
            && n.next_sibling()
                .is_some_and(|s| !trim(&exact_text(s)).is_empty())
        {
            n.before_html(" ")
        }
        n.remove_from_parent()
    }
}
pub(crate) fn process_content(raw: &str, sanitize: bool) -> Result<(String, String), String> {
    let doc = if sanitize {
        Document::from(raw)
    } else {
        Document::fragment(raw)
    };
    let root = if sanitize {
        doc.select("body")
            .nodes()
            .first()
            .copied()
            .unwrap_or(doc.root())
    } else {
        doc.root().first_child().unwrap_or(doc.root())
    };
    if sanitize {
        sanitize_node(root)
    }
    clean(root);
    let leading = if sanitize {
        &raw[..raw.len() - raw.trim_start_matches(['\r', '\n', '\t', ' ']).len()]
    } else {
        ""
    };
    Ok((
        format!("{leading}{}", exact_inner(root)),
        format!("{leading}{}", exact_text(root)),
    ))
}
#[cfg(test)]
#[path = "content_tests.rs"]
mod tests;
fn escape_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('\u{a0}', "&nbsp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('\u{a0}', "&nbsp;")
        .replace('"', "&quot;")
}
pub(crate) fn exact_inner(n: NodeRef<'_>) -> String {
    let mut out = String::new();
    for c in n.children() {
        serialize(c, &mut out)
    }
    out
}
fn serialize(n: NodeRef<'_>, out: &mut String) {
    let is_raw = n.parent().is_some_and(|p| {
        has(
            &[
                "iframe",
                "noembed",
                "noframes",
                "plaintext",
                "script",
                "style",
                "xmp",
            ],
            &tag(p),
        )
    });
    let element = n
        .query(|n| match &n.data {
            NodeData::Text { contents } => {
                if is_raw {
                    out.push_str(contents.as_ref())
                } else {
                    out.push_str(&escape_text(contents.as_ref()))
                }
                None
            }
            NodeData::Comment { contents } => {
                out.push_str("<!--");
                out.push_str(contents.as_ref());
                out.push_str("-->");
                None
            }
            NodeData::Element(e) => Some(e.clone()),
            _ => None,
        })
        .flatten();
    let Some(e) = element else { return };
    let t = e.name.local.as_ref();
    out.push('<');
    out.push_str(t);
    for a in e.attrs {
        out.push(' ');
        if let Some(p) = a.name.prefix.filter(|p| !p.is_empty()) {
            out.push_str(&p);
            out.push(':')
        }
        out.push_str(&a.name.local);
        out.push_str("=\"");
        out.push_str(&escape_attr(&a.value));
        out.push('"')
    }
    out.push('>');
    if e.name.ns.as_ref() == "http://www.w3.org/1999/xhtml"
        && has(
            &[
                "area", "base", "basefont", "bgsound", "br", "col", "embed", "hr", "img", "input",
                "link", "meta", "param", "source", "track", "wbr",
            ],
            t,
        )
    {
        return;
    }
    for c in n.children() {
        serialize(c, out)
    }
    out.push_str("</");
    out.push_str(t);
    out.push('>')
}

pub(crate) fn exact_outer(n: NodeRef<'_>) -> String {
    let mut out = String::new();
    serialize(n, &mut out);
    out
}

#[cfg(test)]
mod policy_lookup_tests {
    use super::*;
    #[test]
    fn optimized_policy_sets_preserve_original_membership() {
        let original: std::collections::BTreeMap<String, String> =
            serde_json::from_str(include_str!("../tests/sanitizer-policy-lookup.json")).unwrap();
        let sets: &[(&str, &[&str])] = &[
            ("URISAFE", URISAFE),
            ("ALLOWED", ALLOWED),
            ("ATTRS", ATTRS),
            ("SVG", SVG),
            ("MATH", MATH),
            ("FORBIDDEN", FORBIDDEN),
            ("DROP", DROP),
            ("DATAURI", DATAURI),
            ("COMMON", COMMON),
            ("MATHINTEGRATION", MATHINTEGRATION),
            ("CLOBBERNAMES", CLOBBERNAMES),
            ("INLINE", INLINE),
            ("EMPTY", EMPTY),
            ("MEDIA", MEDIA),
        ];
        assert_eq!(sets.len(), original.len());
        for (name, entries) in sets {
            let mut expected: Vec<_> = original[*name].split_ascii_whitespace().collect();
            expected.sort_unstable();
            expected.dedup();
            assert_eq!(*entries, expected, "policy membership changed: {name}");
            for value in &expected {
                assert!(has(entries, value));
                for candidate in [
                    format!("{value}-unknown"),
                    format!("x{value}"),
                    value.to_uppercase(),
                ] {
                    assert_eq!(
                        has(entries, &candidate),
                        expected.contains(&candidate.as_str())
                    );
                }
            }
        }
    }
}
