export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function safeUrl(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^(https?:|mailto:)/i.test(text) ? text : '#';
}

// 按显示宽度截断：CJK 等全角字符记 2，其余记 1。
export function clipText(value: unknown, budget: number): string {
  const text = String(value ?? '');
  let width = 0;
  let out = '';
  for (const char of text) {
    const charWidth = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(char) ? 2 : 1;
    if (width + charWidth > budget) return `${out}…`;
    out += char;
    width += charWidth;
  }
  return out;
}
