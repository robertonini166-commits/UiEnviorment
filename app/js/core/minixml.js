// Minimal XML DOM (enough for .rbxmx) so the importer also runs in Node without dependencies.
// Exposes a DOMParser-like API: new MiniDOMParser().parseFromString(xml).documentElement

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e]));

class El {
  constructor(tagName, attrs) {
    this.tagName = tagName;
    this.attrs = attrs;
    this.children = [];
    this._text = [];
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  get textContent() {
    return this._text.join('') + this.children.map((c) => c.textContent).join('');
  }
}

export function parseXml(xml) {
  const root = new El('#document', {});
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top._text.push(m[1]);
    else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[3]) {
      const attrs = {};
      (m[4] || '').replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, __, a, b) => {
        attrs[k] = decode(a ?? b);
        return '';
      });
      const el = new El(m[3], attrs);
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top._text.push(decode(m[6]));
  }
  return root;
}

export class MiniDOMParser {
  parseFromString(xml) {
    const doc = parseXml(xml);
    return { documentElement: doc.children[0] || null };
  }
}
