import type { DesignRevision } from '../domain/schema.js';

// 比较实际字段值，忽略对象键顺序；不用模型猜测变化，也不重复整份设计。
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function describeChanges(previous: DesignRevision, current: DesignRevision): string[] {
  const changes: string[] = [];
  for (const [key, label] of [['requirements', '需求'], ['decisions', '决策'], ['questions', '问题'], ['reviews', '评审'], ['nextSteps', '行动'], ['businessFlows', '业务流程'], ['developmentOrder', '开发顺序']] as const) {
    const before = new Map((previous[key] ?? []).map((item) => [item.id, item]));
    const after = new Map((current[key] ?? []).map((item) => [item.id, item]));
    let added = 0, updated = 0, removed = 0, resolved = 0;
    for (const [id, item] of after) {
      const prior = before.get(id);
      if (!prior) added++;
      else if (canonical(prior) !== canonical(item)) {
        const statusOf = (value: object) => ('status' in value && typeof value.status === 'string' ? value.status : undefined);
        if (key === 'questions' && statusOf(prior) !== 'resolved' && statusOf(item) === 'resolved') resolved++;
        else updated++;
      }
    }
    for (const id of before.keys()) if (!after.has(id)) removed++;
    const parts = [[added, '新增'], [updated, '更新'], [resolved, '解决'], [removed, '移除']] as const;
    const text = parts.filter(([count]) => count).map(([count, verb]) => `${verb} ${count} 项`).join('，');
    if (text) changes.push(`${label}：${text}`);
  }
  if (previous.summary !== current.summary) changes.push('项目摘要已更新');
  if (previous.stage !== current.stage) changes.push(`阶段：${previous.stage} → ${current.stage}`);
  if (canonical(previous.scope) !== canonical(current.scope)) changes.push('本期范围 / 非目标已更新');
  if (canonical(previous.architecture) !== canonical(current.architecture)) changes.push('架构已更新');
  return changes;
}
