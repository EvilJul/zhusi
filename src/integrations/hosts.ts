export type HostId = 'codex' | 'claude' | 'cursor';

export interface HostDefinition {
  id: HostId;
  label: string;
  /** 相对项目根的 Skill 文件；Cursor 用规则文件代替，因此为空。 */
  projectSkillPath?: string;
  /** 相对用户主目录的 Skill 文件。 */
  userSkillPath?: string;
  /** 相对项目根的指令文件。 */
  projectInstructionsPath?: string;
  /** 相对用户主目录的指令文件。 */
  userInstructionsPath?: string;
}

export const HOSTS: Record<HostId, HostDefinition> = {
  codex: {
    id: 'codex',
    label: 'Codex',
    projectSkillPath: '.agents/skills/zhusi/SKILL.md',
    userSkillPath: '.codex/skills/zhusi/SKILL.md',
    projectInstructionsPath: 'AGENTS.md',
    userInstructionsPath: '.codex/AGENTS.md',
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    projectSkillPath: '.claude/skills/zhusi/SKILL.md',
    userSkillPath: '.claude/skills/zhusi/SKILL.md',
    projectInstructionsPath: 'CLAUDE.md',
    userInstructionsPath: '.claude/CLAUDE.md',
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    projectInstructionsPath: '.cursor/rules/zhusi.mdc',
    userInstructionsPath: '.cursor/rules/zhusi.mdc',
  },
};

export const HOST_IDS = Object.keys(HOSTS) as HostId[];

export const BLOCK_START = '<!-- zhusi:start -->';
export const BLOCK_END = '<!-- zhusi:end -->';

export const INSTRUCTION_BLOCK = `${BLOCK_START}
## 筑思（zhusi）

本项目使用 \`zhusi\` 保存设计资料（需求、架构决策、未决问题、评审、已有代码讲解）。

- 读取当前设计：\`zhusi design show --json\`
- 生成提交骨架：\`zhusi design template --out zhusi-draft.json\`
- 提交：\`zhusi design submit --input zhusi-draft.json --json\`（\`--input -\` 可走 stdin）
- 生成报告：\`zhusi report --json\`
- 命令不可用时改用 \`npx zhusi <command>\`

提交规则：必须带等于刚读到的 \`expectedRevision\`；不要写 \`schemaVersion\` / \`projectId\` / \`revision\` / \`createdAt\`；带 \`requestId\` 以支持幂等重试；\`stage: ready\` 时不能有未解决的 blocker 问题。

退出码：\`2\` 输入或 schema 无效，\`3\` 版本冲突或项目忙，\`4\` 设计阶段未满足。

完整工作流见 zhusi 随包发布的 Skill 内容。
${BLOCK_END}`;

export function resolveHosts(host: string): HostDefinition[] {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'all') return HOST_IDS.map((id) => HOSTS[id]);
  const found = HOSTS[normalized as HostId];
  if (!found) {
    throw new Error(`不支持的宿主 "${host}"，可用值为：${[...HOST_IDS, 'all'].join('、')}`);
  }
  return [found];
}
