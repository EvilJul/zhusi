#!/usr/bin/env node
// 手工测试辅助：向目标目录写入一份演示设计数据，便于查看报告与架构图效果。
// 用法：node scripts/seed-demo.mjs [目标目录]
// 说明：完整的“AI 写入设计内容”通道属于后续变更（B），这里只是临时夹具。
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspace } from '../dist/storage/workspace.js';

const target = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'zhusi-demo'));
await mkdir(target, { recursive: true });

const workspace = await Workspace.at(target);
const { config, state } = await workspace.initialize();

if (state.currentRevision > 0) {
  console.log(`目标已存在 revision ${state.currentRevision}，未写入演示数据：${target}`);
  process.exit(0);
}

const revision = await workspace.commitRevision({
  schemaVersion: 1,
  projectId: config.projectId,
  requestId: randomUUID(),
  actor: { client: 'seed-demo', model: 'fixture' },
  stage: 'reviewing',
  summary: '面向独立开发者与小型门店的预约系统：顾客在线选时段，店主管理可用时间与订单。第一版只做单店、单时区、在线支付后置。',
  requirements: [
    { id: 'req_01', summary: '顾客可选择门店可用时段并提交预约', status: 'confirmed' },
    { id: 'req_02', summary: '同一时间段只能被一个有效预约占用', status: 'confirmed' },
    { id: 'req_03', summary: '店主可设置营业时间、单次时长与最大并发', status: 'confirmed' },
    { id: 'req_04', summary: '预计日预约量上限，用于容量设计', status: 'unknown' },
  ],
  decisions: [
    {
      id: 'dec_01', summary: '采用模块化单体，而非微服务', status: 'accepted', choice: '模块化单体',
      rationale: '一人维护、业务边界仍在变化，独立部署带来的运维成本大于收益',
      alternatives: ['按预约/支付/通知拆成三个微服务'], tradeoffs: ['共享发布，单点故障影响面更大'],
      revisitWhen: ['需要按模块独立扩容', '出现明确的团队边界'],
    },
    {
      id: 'dec_02', summary: '用数据库唯一约束保证时段互斥', status: 'accepted', choice: '唯一索引 + 事务',
      rationale: '并发下应用层检查会漏，约束是最后一道防线',
      alternatives: ['应用层先查再写', 'Redis 分布式锁'], tradeoffs: ['需要仔细设计索引键，跨天时段要归一化'],
      revisitWhen: ['引入多资源池模型'],
    },
    {
      id: 'dec_03', summary: '通知先用事务内 outbox 表', status: 'proposed', choice: 'Outbox 表 + 后台轮询',
      rationale: '避免引入消息队列，同时不丢通知', alternatives: ['直接调用邮件 API', '立刻上 Kafka'],
      tradeoffs: ['轮询有延迟，需要处理积压'], revisitWhen: ['通知量级超过单表处理能力'],
    },
  ],
  questions: [
    { id: 'q_01', summary: '是否支持顾客自行取消？取消截止时间是？', priority: 'blocker', status: 'open' },
    { id: 'q_02', summary: '是否需要跨门店、跨时区？', priority: 'important', status: 'open' },
    { id: 'q_03', summary: '支付是否属于第一版？', priority: 'important', status: 'open' },
    { id: 'q_04', summary: '界面语言是否只做简体中文？', priority: 'suggestion', status: 'open' },
  ],
  reviews: [
    { id: 'rev_01', summary: 'dec_02 的唯一索引在多资源池下会失效', priority: 'important', status: 'deferred', details: '当前单店模型成立，但需在 revisitWhen 记录触发条件' },
    { id: 'rev_02', summary: '建议补充通知失败的重试上限', priority: 'suggestion', status: 'accepted' },
  ],
  architecture: {
    modules: [
      { id: 'api', name: 'HTTP API', responsibility: '路由与参数校验', layer: '入口' },
      { id: 'booking', name: '预约服务', responsibility: '时段查询、占用、取消', layer: '应用' },
      { id: 'store', name: '门店配置', responsibility: '营业时间与规则', layer: '应用' },
      { id: 'rule', name: '时段占用规则', responsibility: '互斥与容量约束', layer: '领域' },
      { id: 'db', name: '数据库', responsibility: '唯一索引保证互斥', layer: '基础设施' },
      { id: 'notify', name: '通知 Outbox', responsibility: '轮询与重试发送', layer: '基础设施' },
    ],
    dependencies: [
      { from: 'api', to: 'booking', label: '提交预约' },
      { from: 'api', to: 'store', label: '读取配置' },
      { from: 'booking', to: 'rule', label: '校验时段' },
      { from: 'store', to: 'rule', label: '读取规则' },
      { from: 'rule', to: 'db', label: '唯一约束' },
      { from: 'booking', to: 'db', label: '写入预约' },
      { from: 'booking', to: 'notify', label: '写入通知' },
    ],
    links: [{ label: 'OpenSpec', url: 'https://github.com/Fission-AI/OpenSpec' }],
  },
}, 0);

console.log(`已写入演示数据 revision ${revision.revision}：${target}`);
console.log(`查看报告：zhusi report --project "${target}"`);
