/**
 * Hermes Skills Catalog for the Backlink Campaign Workflow
 *
 * Based on the Hermes Skills System documentation:
 * - Skills are slash commands loaded via skill_view() — e.g. /find_backlink_opportunities
 * - They follow progressive disclosure: skills_list() → skill_view(name) → skill_view(name, file_path)
 * - Skills are invoked by passing the slash command in the user message to Hermes
 *
 * Step types and their compatible skill pools:
 *   hermes_task      → AI-driven research / analysis / verification
 *   browser_use_task → Browser automation for link submission
 */

export interface HermesSkill {
  /** Slug used as the Hermes slash command: /find_backlink_opportunities */
  id: string
  /** Human-readable name shown in the dropdown */
  name: string
  /** Short description shown as subtitle in the dropdown */
  description: string
  /** The step types this skill is compatible with */
  compatibleTypes: ('hermes_task' | 'browser_use_task')[]
  /** Hermes skill category for grouping */
  category: 'research' | 'submission' | 'verification' | 'analysis' | 'reporting'
}

/** Return only the skills valid for a given step type */
export function getSkillsForStepType(
  skills: HermesSkill[],
  type: 'hermes_task' | 'browser_use_task' | string
): HermesSkill[] {
  if (type !== 'hermes_task' && type !== 'browser_use_task') return []
  return skills.filter(s => s.compatibleTypes.includes(type as any))
}

/** Category badge colour map for UI rendering */
export const SKILL_CATEGORY_COLORS: Record<HermesSkill['category'], string> = {
  research:     'text-blue-400 bg-blue-500/10 border-blue-500/20',
  analysis:     'text-purple-400 bg-purple-500/10 border-purple-500/20',
  submission:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  verification: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  reporting:    'text-sky-400 bg-sky-500/10 border-sky-500/20',
}
