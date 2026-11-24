/**
 * Lightweight, namespace-agnostic XML scanner tailored for structured e-invoice documents
 * (UBL 2.1, Peppol BIS 3.0, UN/CEFACT CII, FatturaPA, and Vietnam GDT Circular 78 XML).
 * Runs in Node.js, Bun, Deno, Cloudflare Workers, and browsers with zero dependencies.
 */

const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(input) {
  if (!input) return "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return Object.hasOwn(ENTITY_MAP, entity) ? ENTITY_MAP[entity] : full;
  });
}

function stripNamespace(tagName) {
  const colonIdx = tagName.indexOf(":");
  return colonIdx === -1 ? tagName : tagName.slice(colonIdx + 1);
}

function parseAttributes(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of attrText.matchAll(attrRegex)) {
    const rawKey = match[1];
    const value = decodeXmlEntities(match[2] ?? match[3] ?? "");
    attrs[rawKey] = value;
    const localKey = stripNamespace(rawKey);
    if (!(localKey in attrs)) {
      attrs[localKey] = value;
    }
  }
  return attrs;
}

/**
 * Parses an XML document into a compact tree of `{ name, rawName, attrs, children, text }`.
 */
export function parseXmlTree(xmlString) {
  if (typeof xmlString !== "string" || !xmlString.trim()) {
    throw new TypeError("Expected a non-empty XML string");
  }

  // Strip BOM, XML processing instructions, DOCTYPE, and comments while preserving CDATA text.
  const cdataSlots = [];
  const withoutCdata = xmlString
    .replace(/^\uFEFF/, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content) => {
      const idx = cdataSlots.push(content) - 1;
      return `\u0000CDATA_${idx}\u0000`;
    })
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");

  const root = { name: "#document", rawName: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  const tokenRegex = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;

  for (const match of withoutCdata.matchAll(tokenRegex)) {
    const [, closingSlash, rawTagName, rawAttrs, selfClosingSlash, textChunk] = match;
    if (textChunk !== undefined) {
      const restored = textChunk.replace(/\u0000CDATA_(\d+)\u0000/g, (_, idx) => cdataSlots[Number(idx)] ?? "");
      const decoded = decodeXmlEntities(restored);
      if (decoded.trim()) {
        stack[stack.length - 1].text += decoded;
      }
      continue;
    }

    const localName = stripNamespace(rawTagName);
    if (closingSlash) {
      // Pop matching tag
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === localName || stack[i].rawName === rawTagName) {
          stack[i].text = stack[i].text.trim();
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node = {
      name: localName,
      rawName: rawTagName,
      attrs: parseAttributes(rawAttrs),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosingSlash) {
      stack.push(node);
    }
  }

  if (root.children.length === 0) {
    throw new SyntaxError("Invalid XML: no root element found");
  }
  return root.children[0];
}

/**
 * Navigates first matching descendant path of local tag names, e.g. `findNode(root, ["AccountingSupplierParty", "Party"])`.
 */
export function findNode(node, pathSegments) {
  let current = node;
  for (const segment of pathSegments) {
    if (!current) return null;
    current = current.children.find((child) => child.name === segment) ?? null;
  }
  return current;
}

/**
 * Returns all direct child nodes matching `localName`, or nested path if array is passed.
 */
export function findAll(node, pathSegments) {
  if (!node) return [];
  if (typeof pathSegments === "string") {
    return node.children.filter((child) => child.name === pathSegments);
  }
  if (pathSegments.length === 0) return [node];
  const [head, ...rest] = pathSegments;
  const matches = node.children.filter((child) => child.name === head);
  if (rest.length === 0) return matches;
  return matches.flatMap((child) => findAll(child, rest));
}

export function textAt(node, pathSegments, fallback = null) {
  const target = Array.isArray(pathSegments) ? findNode(node, pathSegments) : findNode(node, [pathSegments]);
  if (!target) return fallback;
  return target.text !== "" ? target.text : fallback;
}

export function numberAt(node, pathSegments, fallback = null) {
  const raw = textAt(node, pathSegments, null);
  if (raw === null) return fallback;
  const normalized = raw.replace(/\s+/g, "").replace(/^(?=-?\d+,\d{1,4}$)/, "");
  const cleaned =
    /^-?\d+,\d+$/.test(normalized) && !normalized.includes(".")
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function attrAt(node, pathSegments, attrName, fallback = null) {
  const target = Array.isArray(pathSegments) ? findNode(node, pathSegments) : findNode(node, [pathSegments]);
  if (!target) return fallback;
  return target.attrs[attrName] ?? fallback;
}
