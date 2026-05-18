// Small DOM helpers shared across pages that build their UI element-by-element.
// Kept tiny on purpose — anything more elaborate belongs in a real component layer.

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  children.flat().forEach((c) => c != null && node.appendChild(c));
  return node;
}

export function svgText(attrs, text) {
  const node = svg("text", attrs);
  node.appendChild(document.createTextNode(text));
  return node;
}
