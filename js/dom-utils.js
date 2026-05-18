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

// Visual styling and friendly names for athletics result honors.
// Keep this map small and additive — anything we can't classify falls
// back to a neutral slate badge.
const HONOR_STYLES = {
  WR: { bg: "bg-yellow-400",  fg: "text-black", title: "World Record" },
  WL: { bg: "bg-amber-500",   fg: "text-black", title: "World Lead" },
  CR: { bg: "bg-amber-500",   fg: "text-black", title: "Championship Record" },
  MR: { bg: "bg-amber-400",   fg: "text-black", title: "Meeting Record" },
  NR: { bg: "bg-amber-400",   fg: "text-black", title: "National Record" },
  AR: { bg: "bg-amber-400",   fg: "text-black", title: "Area Record" },
  PB: { bg: "bg-emerald-500", fg: "text-white", title: "Personal Best" },
  SB: { bg: "bg-emerald-700", fg: "text-white", title: "Season Best" },
};

export function renderHonor(code) {
  const style = HONOR_STYLES[code] || { bg: "bg-slate-600", fg: "text-white", title: code };
  return el("span", {
    className: `ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${style.bg} ${style.fg}`,
    title: style.title,
  }, code);
}
