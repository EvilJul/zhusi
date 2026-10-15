import { clipText, escapeHtml } from './escape.js';

export interface DiagramModule {
  id?: string;
  name: string;
  responsibility?: string;
  layer?: string;
}

export interface DiagramDependency {
  from: string;
  to: string;
  label?: string;
}

const NODE_W = 212;
const NODE_H = 70;
const COL_GAP = 92;
const ROW_GAP = 30;
const PAD = 34;
const BAND_LABEL_H = 34;
const SKIP_BOW = 58;
const MIN_W = 560;
const MIN_H = 176;

interface Placement {
  x: number;
  y: number;
}

/** 解析模块标识：优先 id，其次 name，两者都登记以便依赖引用任意一个。 */
function buildLookup(modules: DiagramModule[]): Map<string, number> {
  const lookup = new Map<string, number>();
  modules.forEach((module, index) => {
    const name = module.name.trim();
    const id = module.id?.trim();
    if (name) lookup.set(name, index);
    if (id && id !== name) lookup.set(id, index);
  });
  return lookup;
}

/** 有显式 layer 时按 layer 归列；否则用依赖关系做拓扑分层，环上的节点兜底放在最后一列。 */
function assignLayers(modules: DiagramModule[], dependencies: DiagramDependency[], lookup: Map<string, number>) {
  const explicit = modules.length > 0 && modules.every((module) => Boolean(module.layer?.trim()));
  const layerOf = new Array<number>(modules.length).fill(0);
  let layerNames: string[] = [];

  if (explicit) {
    for (const module of modules) {
      const name = module.layer!.trim();
      if (!layerNames.includes(name)) layerNames.push(name);
    }
    modules.forEach((module, index) => { layerOf[index] = layerNames.indexOf(module.layer!.trim()); });
    return { layerOf, layerNames, showBands: true };
  }

  const adjacency = modules.map(() => [] as number[]);
  const indegree = new Array<number>(modules.length).fill(0);
  for (const dependency of dependencies) {
    const from = lookup.get(dependency.from.trim());
    const to = lookup.get(dependency.to.trim());
    if (from === undefined || to === undefined || from === to) continue;
    adjacency[from]!.push(to);
    indegree[to] += 1;
  }

  const queue = modules.map((_, index) => index).filter((index) => indegree[index] === 0);
  const visited = new Set<number>(queue);
  let guard = 0;
  while (queue.length > 0 && guard <= modules.length * 4) {
    guard += 1;
    const current = queue.shift()!;
    for (const next of adjacency[current]!) {
      layerOf[next] = Math.max(layerOf[next]!, layerOf[current]! + 1);
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  let maxLayer = layerOf.reduce((max, value) => Math.max(max, value), 0);
  modules.forEach((_, index) => {
    if (!visited.has(index)) layerOf[index] = (maxLayer += 1);
  });
  layerNames = Array.from({ length: maxLayer + 1 }, (_, index) => `第 ${index + 1} 层`);
  return { layerOf, layerNames, showBands: false };
}

export function renderArchitectureDiagram(modules: DiagramModule[], dependencies: DiagramDependency[]): string {
  if (modules.length === 0) {
    return '<p class="empty">未提供模块信息，架构图无法生成。请在 architecture.modules 中补充模块。</p>';
  }

  const lookup = buildLookup(modules);
  const { layerOf, layerNames, showBands } = assignLayers(modules, dependencies, lookup);

  const columns = new Map<number, number[]>();
  modules.forEach((_, index) => {
    const layer = layerOf[index]!;
    if (!columns.has(layer)) columns.set(layer, []);
    columns.get(layer)!.push(index);
  });
  const layerOrder = [...columns.keys()].sort((a, b) => a - b);
  const columnIndex = new Map(layerOrder.map((layer, index) => [layer, index]));
  const tallest = Math.max(...layerOrder.map((layer) => columns.get(layer)!.length));

  const width = Math.max(MIN_W, PAD * 2 + layerOrder.length * NODE_W + (layerOrder.length - 1) * COL_GAP);
  const height = Math.max(MIN_H, PAD * 2 + BAND_LABEL_H + tallest * NODE_H + (tallest - 1) * ROW_GAP);

  const placement = new Map<number, Placement>();
  for (const layer of layerOrder) {
    const column = columnIndex.get(layer)!;
    const rows = columns.get(layer)!;
    const stackHeight = rows.length * NODE_H + (rows.length - 1) * ROW_GAP;
    const startY = PAD + BAND_LABEL_H + (height - PAD * 2 - BAND_LABEL_H - stackHeight) / 2;
    rows.forEach((moduleIndex, row) => {
      placement.set(moduleIndex, {
        x: PAD + column * (NODE_W + COL_GAP),
        y: startY + row * (NODE_H + ROW_GAP),
      });
    });
  }

  const bands = showBands ? layerOrder.map((layer) => {
    const column = columnIndex.get(layer)!;
    const x = PAD + column * (NODE_W + COL_GAP) - 12;
    return `<rect class="band" x="${x}" y="${PAD}" width="${NODE_W + 24}" height="${height - PAD * 2}" rx="8"/>`
      + `<text class="band-label" x="${x + 12}" y="${PAD + 20}">${escapeHtml(clipText(layerNames[layer] ?? '', 30))}</text>`;
  }).join('') : '';

  const drawnEdges = dependencies.map((dependency) => {
    const from = lookup.get(dependency.from.trim());
    const to = lookup.get(dependency.to.trim());
    if (from === undefined || to === undefined || from === to) return '';
    const a = placement.get(from);
    const b = placement.get(to);
    if (!a || !b) return '';

    const sameColumn = a.x === b.x;
    const forward = b.x > a.x;
    const columnSpan = Math.abs((columnIndex.get(layerOf[to]!) ?? 0) - (columnIndex.get(layerOf[from]!) ?? 0));
    const x1 = sameColumn || forward ? a.x + NODE_W : a.x;
    const y1 = a.y + NODE_H / 2;
    const x2 = sameColumn ? b.x + NODE_W : forward ? b.x : b.x + NODE_W;
    const y2 = b.y + NODE_H / 2;
    const reach = sameColumn ? COL_GAP * 0.45 : Math.max(34, Math.abs(x2 - x1) / 2);
    const direction = sameColumn || forward ? 1 : -1;
    // 跨列连线从中间模块上方绕过，避免从节点框后面穿过。
    const bow = columnSpan > 1 && !sameColumn ? SKIP_BOW : 0;
    const cy1 = y1 - bow;
    const cy2 = y2 - bow;
    const path = sameColumn
      ? `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 + reach} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + direction * reach} ${cy1}, ${x2 - direction * reach} ${cy2}, ${x2} ${y2}`;
    const title = dependency.label ? `<title>${escapeHtml(dependency.label)}</title>` : '';
    const midX = (x1 + 3 * (x1 + direction * reach) + 3 * (x2 - direction * reach) + x2) / 8;
    const midY = (y1 + 3 * cy1 + 3 * cy2 + y2) / 8;
    const label = dependency.label && (sameColumn || Math.abs(x2 - x1) >= 84)
      ? `<text class="edge-label" x="${(sameColumn ? x1 - 8 : midX).toFixed(1)}" y="${(midY - 4).toFixed(1)}" text-anchor="${sameColumn ? 'end' : 'middle'}">${escapeHtml(clipText(dependency.label, 18))}</text>`
      : '';
    return `<g class="edge" data-from="${from}" data-to="${to}">${title}<path d="${path}" marker-end="url(#arrow)"/>${label}</g>`;
  }).join('');

  const nodes = modules.map((module, index) => {
    const spot = placement.get(index)!;
    const name = clipText(module.name.trim(), 24);
    const responsibility = module.responsibility?.trim();
    const subtitle = responsibility ? clipText(responsibility, 30) : '';
    const tooltip = responsibility ? `${module.name} — ${responsibility}` : module.name;
    const single = !subtitle;
    return `<g class="node" data-node="${index}" tabindex="0" role="group" aria-label="${escapeHtml(tooltip)}"><title>${escapeHtml(tooltip)}</title>`
      + `<rect x="${spot.x}" y="${spot.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>`
      + `<text class="node-name" x="${spot.x + NODE_W / 2}" y="${spot.y + (single ? NODE_H / 2 + 5 : 29)}" text-anchor="middle">${escapeHtml(name)}</text>`
      + (single ? '' : `<text class="node-sub" x="${spot.x + NODE_W / 2}" y="${spot.y + 50}" text-anchor="middle">${escapeHtml(subtitle)}</text>`)
      + '</g>';
  }).join('');

  // 选择器只使用内部数字索引，绝不把用户提供的名称或 id 拼进 CSS。
  // :focus-visible 保留键盘访问；鼠标点击后移开不会遗留流向。
  const flowRules = modules.map((_, index) => {
    const hover = `.arch:has(.node[data-node="${index}"]:hover)`;
    const keyboard = `.arch:not(:has(.node:hover)):has(.node[data-node="${index}"]:focus-visible)`;
    const touch = `.arch:has(.node[data-node="${index}"]:focus)`;
    const rules = (selector: string) => `${selector} .edge[data-to="${index}"]{opacity:1;--flow:#377cad}${selector} .edge[data-to="${index}"] path{marker-end:url(#arrow-in)}${selector} .edge[data-from="${index}"]{opacity:1;--flow:#1d6a52}${selector} .edge[data-from="${index}"] path{marker-end:url(#arrow-out)}`;
    return rules(hover) + rules(keyboard) + `@media(hover:none){${rules(touch)}}`;
  }).join('');

  return `<svg class="arch" viewBox="0 0 ${width} ${height}" role="group" aria-label="模块依赖架构图：悬停或聚焦模块查看流向">`
    + '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
    + '<path d="M0,0 L9,4.5 L0,9 z" fill="#7b8b84"/></marker></defs>'
    + '<defs><marker id="arrow-in" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#377cad"/></marker><marker id="arrow-out" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#1d6a52"/></marker></defs>'
    + `<style>
.arch .edge{opacity:0;pointer-events:none;--flow:#7b8b84;transition:opacity .16s ease}
.arch .edge path{stroke:var(--flow);stroke-width:2;stroke-dasharray:7 5;animation:flow 1s linear infinite}
.arch .edge-label{fill:var(--flow)}
.arch .node{outline:none;cursor:default}
.arch .node:is(:hover,:focus-visible) rect{stroke:#1d6a52;stroke-width:2.5;fill:#e7f1ec}
${flowRules}
@keyframes flow{to{stroke-dashoffset:-24}}
@media(prefers-reduced-motion:reduce){.arch .edge{transition:none}.arch .edge path{animation:none}}
@media print{.arch .edge{opacity:1!important}.arch .edge path{animation:none;stroke-dasharray:none}}
</style>`
    + bands + drawnEdges + nodes + '</svg>';
}
