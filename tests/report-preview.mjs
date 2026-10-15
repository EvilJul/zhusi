// npm run build && node tests/report-preview.mjs /tmp/zhusi-report-preview.html
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { renderHtml } from '../dist/report/render.js';
import { DesignSubmissionSchema } from '../dist/domain/schema.js';
const input = DesignSubmissionSchema.parse({
  expectedRevision: 1, requestId: 'preview', stage: 'reviewing',
  summary: '单店预约系统。顾客选时段预约，店员处理取消；本期只支持单店。',
  scope: { included: ['选择时段、提交预约、取消预约'], excluded: ['多门店、在线支付、跨时区'] },
  requirements: [
    { id: 'r1', summary: '顾客选择空闲时段后提交预约', status: 'confirmed' },
    { id: 'r2', summary: '同一时段仅允许一笔有效预约', status: 'confirmed' },
    { id: 'r3', summary: '预约成功后发送提醒', status: 'assumed' },
  ],
  decisions: [{ id: 'd1', summary: '采用模块化单体', choice: '采用模块化单体', status: 'accepted', rationale: '当前由一人维护，统一部署便于排查问题。', tradeoffs: ['各模块需要一起发布'], alternatives: ['微服务：部署与排障成本更高'], revisitWhen: ['模块需要独立扩容'] }, { id: 'd2', summary: '暂不引入消息队列', status: 'deferred', rationale: '等通知量增长后再评估。' }],
  questions: [{ id: 'q1', summary: '取消是否必须提前 24 小时？', priority: 'blocker', status: 'open', details: '影响可取消时段与退款规则。' }, { id: 'q2', summary: '第一版只做单店', priority: 'blocker', status: 'resolved' }],
  reviews: [{ id: 'v1', summary: '增加重复预约防护', priority: 'important', status: 'accepted', details: '以数据库唯一约束兜底。' }],
  nextSteps: [{ id: 's1', summary: '确认取消规则', acceptance: '明确截止时间和例外条件', status: 'pending' }, { id: 's2', summary: '实现预约占用', prerequisite: '确认时段粒度', acceptance: '并发预约同一时段只成功一次', status: 'pending' }],
  architecture: {
    modules: [{ id: 'web', name: '顾客端', responsibility: '选择时段、提交预约', layer: '入口' }, { id: 'admin', name: '店员端', responsibility: '管理预约与取消', layer: '入口' }, { id: 'booking', name: '预约服务', responsibility: '检查时段、创建预约', layer: '业务' }, { id: 'notice', name: '通知服务', responsibility: '发送预约提醒', layer: '业务' }, { id: 'db', name: '数据库', responsibility: '保存预约、约束冲突', layer: '存储' }],
    dependencies: [{ from: 'web', to: 'booking', label: '提交预约' }, { from: 'admin', to: 'booking', label: '管理预约' }, { from: 'booking', to: 'db', label: '占用时段' }, { from: 'booking', to: 'notice', label: '通知预约结果' }, { from: 'notice', to: 'db', label: '记录送达状态' }], links: [],
  },
});
const now = '2026-10-14T00:00:00.000Z';
const revision = { ...input, schemaVersion: 1, projectId: 'preview', revision: 2, createdAt: now, actor: {} };
const previousRevision = { ...revision, revision: 1, requirements: input.requirements.slice(0, 2), nextSteps: [], questions: input.questions.map((question) => ({ ...question, status: 'open' })) };
export const previewHtml = renderHtml({ state: { schemaVersion: 1, projectId: 'preview', currentRevision: 2, currentExplanation: 0, updatedAt: now }, revision, previousRevision, explanation: null, warnings: [] });
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const output = process.argv[2] || '/tmp/zhusi-report-preview.html';
  await writeFile(output, previewHtml);
  console.log(output);
}
