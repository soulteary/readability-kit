// SPDX-License-Identifier: Apache-2.0
// Semantic cleanup adapted from packages/javascript/src/cleanup.ts, including Chromium-derived
// behavior. See LICENSES/BSD-3-Clause-Chromium.txt for upstream attribution.
package readability

import (
	"github.com/soulteary/readability-kit/go/internal/dom"
	"regexp"
	"strings"
	"unicode"

	"github.com/soulteary/readability-kit/go/internal/html"
	"golang.org/x/net/html/atom"
)

// SanitizerPolicy identifies the DOMPurify default policy used by the JS API,
// with the API's explicit tag and style attribute exclusions.
const SanitizerPolicy = "dompurify-default-v1"

func contentSet(words string) map[string]bool {
	m := make(map[string]bool)
	for _, word := range strings.Fields(words) {
		m[word] = true
	}
	return m
}

// Policy tables adapted from DOMPurify 3.4.17 (Apache-2.0 OR MPL-2.0).
// DOMPurify lowercases tag tables in HTML mode, including SVG filter names.
var contentAllowed = contentSet("a abbr acronym address area article aside audio b bdi bdo big blink blockquote body br button canvas caption center cite code col colgroup content data datalist dd decorator del details dfn dialog dir div dl dt element em fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i img input ins kbd label legend li main map mark marquee menu menuitem meter nav nobr ol optgroup option output p picture pre progress q rp rt ruby s samp search section select shadow slot small source spacer span strike strong style sub summary sup table tbody td template textarea tfoot th thead time tr track tt u ul var video wbr svg altglyph altglyphdef altglyphitem animatecolor animatemotion animatetransform circle clippath defs desc ellipse enterkeyhint exportparts filter g glyph glyphref hkern image inputmode line lineargradient marker mask metadata mpath part path pattern polygon polyline radialgradient rect stop switch symbol text textpath title tref tspan view vkern feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence math menclose merror mfenced mfrac mglyph mi mlabeledtr mmultiscripts mn mo mover mpadded mphantom mroot mrow ms mspace msqrt mstyle msub msup msubsup mtable mtd mtext mtr munder munderover mprescripts")
var contentAttrs = contentSet("accept action align alt autocapitalize autocomplete autopictureinpicture autoplay background bgcolor border capture cellpadding cellspacing checked cite class clear color cols colspan command commandfor controls controlslist coords crossorigin datetime decoding default dir disabled disablepictureinpicture disableremoteplayback download draggable enctype enterkeyhint exportparts face for headers height hidden high href hreflang id inert inputmode integrity ismap kind label lang list loading loop low max maxlength media method min minlength multiple muted name nonce noshade novalidate nowrap open optimum part pattern placeholder playsinline popover popovertarget popovertargetaction poster preload pubdate radiogroup readonly rel required rev reversed role rows rowspan spellcheck scope selected shape size sizes slot span srclang start src srcset step style summary tabindex title translate type usemap valign value width wrap xmlns accent-height accumulate additive alignment-baseline amplitude ascent attributename attributetype azimuth basefrequency baseline-shift begin bias by clip clippathunits clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering cx cy d dx dy diffuseconstant direction display divisor dominant-baseline dur edgemode elevation end exponent fill fill-opacity fill-rule filter filterunits flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight fx fy g1 g2 glyph-name glyphref gradientunits gradienttransform image-rendering in in2 intercept k k1 k2 k3 k4 kerning keypoints keysplines keytimes lengthadjust letter-spacing kernelmatrix kernelunitlength lighting-color local marker-end marker-mid marker-start markerheight markerunits markerwidth maskcontentunits maskunits mask mask-type mode numoctaves offset operator opacity order orient orientation origin overflow paint-order path pathlength patterncontentunits patterntransform patternunits pointer-events points preservealpha preserveaspectratio primitiveunits r rx ry radius refx refy repeatcount repeatdur restart result rotate scale seed shape-rendering slope specularconstant specularexponent spreadmethod startoffset stddeviation stitchtiles stop-color stop-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke stroke-width surfacescale systemlanguage tablevalues targetx targety transform transform-origin text-anchor text-decoration text-orientation text-rendering textlength u1 u2 unicode values vector-effect viewbox visibility version vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xchannelselector ychannelselector x x1 x2 y y1 y2 z zoomandpan accent accentunder bevelled close columnalign columnlines columnspacing columnspan denomalign depth displaystyle encoding fence frame largeop length linethickness lquote lspace mathbackground mathcolor mathsize mathvariant maxsize minsize movablelimits notation numalign rowalign rowlines rowspacing rspace rquote scriptlevel scriptminsize scriptsizemultiplier selection separator separators stretchy subscriptshift supscriptshift symmetric voffset xlink:href xml:id xlink:title xml:space xmlns:xlink")
var contentSVG = contentSet("svg a altglyph altglyphdef altglyphitem animatecolor animatemotion animatetransform circle clippath defs desc ellipse enterkeyhint exportparts filter font g glyph glyphref hkern image inputmode line lineargradient marker mask metadata mpath part path pattern polygon polyline radialgradient rect stop style switch symbol text textpath title tref tspan view vkern feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence animate color-profile cursor discard font-face font-face-format font-face-name font-face-src font-face-uri foreignobject hatch hatchpath mesh meshgradient meshpatch meshrow missing-glyph script set solidcolor unknown use")
var contentMath = contentSet("math menclose merror mfenced mfrac mglyph mi mlabeledtr mmultiscripts mn mo mover mpadded mphantom mroot mrow ms mspace msqrt mstyle msub msup msubsup mtable mtd mtext mtr munder munderover mprescripts maction maligngroup malignmark mlongdiv mscarries mscarry msgroup mstack msline msrow semantics annotation annotation-xml none")
var contentForbidden = contentSet("style form input button textarea select option")
var contentDrop = contentSet("annotation-xml audio colgroup desc foreignobject head iframe math mi mn mo ms mtext noembed noframes noscript plaintext script selectedcontent style svg template thead title video xmp")
var contentURISafe = contentSet("alt class for id label name pattern placeholder role summary title value style xmlns")
var contentDataURI = contentSet("audio video img source image track")
var contentCommon = contentSet("title style font a script")
var contentMathIntegration = contentSet("mi mo mn ms mtext")

func contentText(n *html.Node) string { return dom.Text(n) }

func contentTrim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		return r == '\uFEFF' || r == '\t' || r == '\n' || r == '\v' || r == '\f' || r == '\r' || r == '\u2028' || r == '\u2029' || unicode.Is(unicode.Zs, r)
	})
}

var contentAllowedURI = regexp.MustCompile(`(?i)^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`)
var contentAttrWhitespace = regexp.MustCompile(`[\x00-\x20\x{00a0}\x{1680}\x{180e}\x{2000}-\x{2029}\x{205f}\x{3000}]`)
var contentUnsafeAttr = regexp.MustCompile(`(?i)((--!?|\])>)|</(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)`)
var contentDataAttr = regexp.MustCompile(`^data-[-\w.\x{00b7}-\x{ffff}]+$`)
var contentAriaAttr = regexp.MustCompile(`^aria-[-\w]+$`)

func contentNamespaceValid(n *html.Node) bool {
	tag := strings.ToLower(n.Data)
	p := n.Parent
	parentTag := strings.ToLower(p.Data)
	switch n.Namespace {
	case "svg":
		if p.Namespace == "" {
			return tag == "svg"
		}
		if p.Namespace == "math" {
			return tag == "svg" && (parentTag == "annotation-xml" || contentMathIntegration[parentTag])
		}
		return contentSVG[tag]
	case "math":
		if p.Namespace == "" {
			return tag == "math"
		}
		if p.Namespace == "svg" {
			return tag == "math" && parentTag == "annotation-xml"
		}
		return contentMath[tag]
	case "":
		if p.Namespace == "svg" && parentTag != "annotation-xml" {
			return false
		}
		if p.Namespace == "math" && !contentMathIntegration[parentTag] {
			return false
		}
		return !contentMath[tag] && (contentCommon[tag] || !contentSVG[tag])
	default:
		return false
	}
}

func sanitizeContentNode(parent *html.Node) {
	for n := parent.FirstChild; n != nil; {
		next := n.NextSibling
		if n.Type == html.CommentNode || n.Type == html.DoctypeNode {
			parent.RemoveChild(n)
			n = next
			continue
		}
		if n.Type != html.ElementNode {
			n = next
			continue
		}
		tag := strings.ToLower(n.Data)
		allowed := contentAllowed[tag] && !contentForbidden[tag]
		if !allowed {
			if !contentDrop[tag] {
				if n.FirstChild != nil {
					next = n.FirstChild
				}
				// Unwrap before traversing so namespace checks see the surviving parent,
				// matching DOMPurify's cloned-node traversal.
				for n.FirstChild != nil {
					c := n.FirstChild
					n.RemoveChild(c)
					parent.InsertBefore(c, n)
				}
			}
			parent.RemoveChild(n)
			// Newly unwrapped children must be visited as well.
			n = next
			continue
		}
		if !contentNamespaceValid(n) {
			parent.RemoveChild(n)
			n = next
			continue
		}
		attrs := n.Attr[:0]
		for _, a := range n.Attr {
			key := strings.ToLower(a.Key)
			if a.Namespace != "" {
				key = a.Namespace + ":" + key
			}
			value := a.Val
			if key != "value" {
				value = contentTrim(value)
			}
			if key == "style" || strings.ContainsAny(value, "<>") && contentUnsafeAttr.MatchString(value) || key == "attributename" && strings.Contains(value, "href") {
				continue
			}
			customAttr := strings.HasPrefix(key, "data-") && contentDataAttr.MatchString(key) || strings.HasPrefix(key, "aria-") && contentAriaAttr.MatchString(key)
			if !contentAttrs[key] && !customAttr {
				continue
			}
			// DOM clobbering protection mirrors the document/form named-property guard.
			if (key == "id" || key == "name") && contentClobberNames[value] {
				continue
			}
			safe := contentURISafe[key] || customAttr || value == "" || contentAllowedURI.MatchString(contentAttrWhitespace.ReplaceAllString(value, ""))
			if !safe && (key == "src" || key == "href" || key == "xlink:href") && contentDataURI[tag] && strings.HasPrefix(value, "data:") {
				safe = true
			}
			if safe {
				a.Val = value
				attrs = append(attrs, a)
			}
		}
		n.Attr = attrs
		sanitizeContentNode(n)
		n = next
	}
}

// DOM document and form prototype property names, used by SANITIZE_DOM.
var contentClobberNames = contentSet("ATTRIBUTE_NODE CDATA_SECTION_NODE COMMENT_NODE DOCUMENT_FRAGMENT_NODE DOCUMENT_NODE DOCUMENT_POSITION_CONTAINED_BY DOCUMENT_POSITION_CONTAINS DOCUMENT_POSITION_DISCONNECTED DOCUMENT_POSITION_FOLLOWING DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC DOCUMENT_POSITION_PRECEDING DOCUMENT_TYPE_NODE ELEMENT_NODE ENTITY_NODE ENTITY_REFERENCE_NODE NOTATION_NODE PROCESSING_INSTRUCTION_NODE TEXT_NODE URL __defineGetter__ __defineSetter__ __lookupGetter__ __lookupSetter__ __proto__ acceptCharset accessKey action activeElement addEventListener adoptNode after anchors append appendChild applets ariaAtomic ariaAutoComplete ariaBusy ariaChecked ariaColCount ariaColIndex ariaColIndexText ariaColSpan ariaCurrent ariaDescription ariaDisabled ariaExpanded ariaHasPopup ariaHidden ariaInvalid ariaKeyShortcuts ariaLabel ariaLevel ariaLive ariaModal ariaMultiLine ariaMultiSelectable ariaOrientation ariaPlaceholder ariaPosInSet ariaPressed ariaReadOnly ariaRelevant ariaRequired ariaRoleDescription ariaRowCount ariaRowIndex ariaRowIndexText ariaRowSpan ariaSelected ariaSetSize ariaSort ariaValueMax ariaValueMin ariaValueNow ariaValueText assignedSlot attachInternals attachShadow attributes baseURI before blur body captureEvents characterSet charset checkValidity childElementCount childNodes children classList className clear click clientHeight clientLeft clientTop clientWidth cloneNode close closest compareDocumentPosition compatMode constructor contains contentType cookie createAttribute createAttributeNS createCDATASection createComment createDocumentFragment createElement createElementNS createEvent createExpression createNSResolver createNodeIterator createProcessingInstruction createRange createTextNode createTreeWalker currentScript dataset defaultView dir dispatchEvent doctype documentElement documentURI draggable elements embeds enctype evaluate firstChild firstElementChild focus forms getAttribute getAttributeNS getAttributeNames getAttributeNode getAttributeNodeNS getBoundingClientRect getClientRects getElementById getElementsByClassName getElementsByName getElementsByTagName getElementsByTagNameNS getRootNode getSelection hasAttribute hasAttributeNS hasAttributes hasChildNodes hasFocus hasOwnProperty head hidden id images implementation importNode innerHTML inputEncoding insertAdjacentElement insertAdjacentHTML insertAdjacentText insertBefore isConnected isDefaultNamespace isEqualNode isPrototypeOf isSameNode lang lastChild lastElementChild lastModified length links localName location lookupNamespaceURI lookupPrefix matches method name namespaceURI nextElementSibling nextSibling noValidate nodeName nodeType nodeValue nonce normalize offsetHeight offsetLeft offsetParent offsetTop offsetWidth onabort onauxclick onbeforeinput onbeforematch onbeforetoggle onblur oncancel oncanplay oncanplaythrough onchange onclick onclose oncontextlost oncontextmenu oncontextrestored oncopy oncuechange oncut ondblclick ondrag ondragend ondragenter ondragleave ondragover ondragstart ondrop ondurationchange onemptied onended onerror onfocus onformdata ongotpointercapture oninput oninvalid onkeydown onkeypress onkeyup onload onloadeddata onloadedmetadata onloadstart onlostpointercapture onmousedown onmouseenter onmouseleave onmousemove onmouseout onmouseover onmouseup onpaste onpause onplay onplaying onpointercancel onpointerdown onpointerenter onpointerleave onpointermove onpointerout onpointerover onpointerrawupdate onpointerup onprogress onratechange onreadystatechange onreset onresize onscroll onscrollend onsecuritypolicyviolation onseeked onseeking onselect onslotchange onstalled onsubmit onsuspend ontimeupdate ontoggle ontouchcancel ontouchend ontouchmove ontouchstart onvisibilitychange onvolumechange onwaiting onwebkitanimationend onwebkitanimationiteration onwebkitanimationstart onwebkittransitionend onwheel open outerHTML ownerDocument parentElement parentNode plugins prefix prepend previousElementSibling previousSibling propertyIsEnumerable querySelector querySelectorAll readyState referrer releaseEvents remove removeAttribute removeAttributeNS removeAttributeNode removeChild removeEventListener replaceChild replaceChildren replaceWith reportValidity requestSubmit reset role scripts scrollHeight scrollLeft scrollTop scrollWidth setAttribute setAttributeNS setAttributeNode setAttributeNodeNS shadowRoot slot style styleSheets submit tabIndex tagName target textContent title toLocaleString toString toggleAttribute translate valueOf visibilityState webkitMatchesSelector write writeln")

var contentInline = contentSet("span b i strong em")
var contentEmpty = contentSet("div p section aside header footer article main nav figure figcaption ul ol li span b i strong em")
var contentMedia = contentSet("img canvas picture video audio iframe svg math")
var contentLabels = contentSet("advertisement sponsored")

func cleanContentNode(root *html.Node) {
	// Cleanup visits parents before children. A node's own subtree is therefore
	// unchanged when it is visited, even though its preceding siblings may have
	// been removed. Index original subtree text in one shared buffer, and keep
	// sibling text reads below live to preserve whitespace insertion semantics.
	type entry struct {
		node              *html.Node
		start, end, after int
		media             bool
	}
	// Size the two request-local buffers exactly; neither retains DOM nodes
	// between requests or allocates another string for each ancestor.
	elements, textBytes := 0, 0
	var size func(*html.Node)
	size = func(n *html.Node) {
		if n != root && n.Type == html.ElementNode {
			elements++
		} else if n.Type == html.TextNode {
			textBytes += len(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			size(c)
		}
	}
	size(root)
	snapshot := make([]entry, 0, elements)
	var allText strings.Builder
	allText.Grow(textBytes)
	var collect func(*html.Node) bool
	collect = func(n *html.Node) bool {
		index := -1
		if n != root && n.Type == html.ElementNode {
			index = len(snapshot)
			snapshot = append(snapshot, entry{node: n, start: allText.Len()})
		}
		if n.Type == html.TextNode {
			allText.WriteString(n.Data)
		}
		media := n.Type == html.ElementNode && contentMedia[n.Data]
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if collect(c) {
				media = true
			}
		}
		if index >= 0 {
			snapshot[index].end = allText.Len()
			snapshot[index].after = len(snapshot)
			snapshot[index].media = media
		}
		return media
	}
	collect(root)
	textBuffer := allText.String()
	for i := 0; i < len(snapshot); i++ {
		e := snapshot[i]
		n := e.node
		raw := textBuffer[e.start:e.end]
		text := contentTrim(raw)
		media := e.media
		announcement := false
		for _, a := range n.Attr {
			if a.Key == "aria-live" && (a.Val == "polite" || a.Val == "assertive") || a.Key == "role" && (a.Val == "alert" || a.Val == "status" || a.Val == "log") {
				announcement = true
			}
		}
		label := false
		// Lowercasing maps one rune to one rune. Even a label written
		// with Unicode uppercase equivalents fits in four bytes per rune;
		// longer article text cannot be a label and needs no lowercase copy.
		if len(text) <= 4*len("skip advertisement") {
			lower := strings.ToLower(text)
			label = contentLabels[lower] || lower == "supported by" || lower == "skip advertisement"
		}
		if !media && ((announcement && UTF16Len(text) < 200) || label) {
			n.Parent.RemoveChild(n)
			i = e.after - 1
			continue
		}
		if !contentEmpty[n.Data] || text != "" || media {
			continue
		}
		if contentInline[n.Data] && raw != "" && n.PrevSibling != nil && n.NextSibling != nil && contentTrim(contentText(n.PrevSibling)) != "" && contentTrim(contentText(n.NextSibling)) != "" {
			n.Parent.InsertBefore(&html.Node{Type: html.TextNode, Data: " "}, n)
		}
		n.Parent.RemoveChild(n)
		i = e.after - 1
	}
}

func processContent(raw string, sanitize bool) (content, text string, err error) {
	root := &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div}
	var nodes []*html.Node
	if sanitize {
		// DOMPurify parses an HTML document before returning its body markup.
		// A document parse also applies foreign-content breakout rules which
		// x/net/html deliberately skips in its fragment parser.
		doc, parseErr := html.Parse(strings.NewReader(raw))
		if parseErr != nil {
			return "", "", parseErr
		}
		var findBody func(*html.Node) *html.Node
		findBody = func(n *html.Node) *html.Node {
			if n.Type == html.ElementNode && n.Data == "body" {
				return n
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if body := findBody(c); body != nil {
					return body
				}
			}
			return nil
		}
		leading := len(raw) - len(strings.TrimLeft(raw, "\r\n\t "))
		if leading > 0 {
			nodes = append(nodes, &html.Node{Type: html.TextNode, Data: raw[:leading]})
		}
		if body := findBody(doc); body != nil {
			for body.FirstChild != nil {
				n := body.FirstChild
				body.RemoveChild(n)
				nodes = append(nodes, n)
			}
		}
	} else {
		var parseErr error
		nodes, parseErr = html.ParseFragment(strings.NewReader(raw), root)
		if parseErr != nil {
			return "", "", parseErr
		}
	}
	for _, n := range nodes {
		root.AppendChild(n)
	}
	if sanitize {
		sanitizeContentNode(root)
	}
	cleanContentNode(root)
	return dom.Inner(root), contentText(root), nil
}
