/**
 * Validates every file in /content and compiles it into one JSON bundle the
 * mobile app imports (and that scripts/sync can upsert into Supabase).
 *
 *   pnpm content:build   # validate + write the bundle
 *   pnpm content:check   # validate + fail if the bundle is stale (CI)
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  Activity,
  Checkins,
  ContentBundle,
  Module,
  PUBLISH_MINIMUMS,
  Resource,
  type ContentBundle as Bundle,
} from '../packages/content-schema/src/index';
import { z } from 'zod';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
export const OUTPUT = join(ROOT, 'apps/mobile/src/content/content.generated.json');

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : name.endsWith('.yaml') ? [full] : [];
    });
}

export function buildBundle(contentDir = CONTENT): { bundle: Bundle | null; errors: string[] } {
  const errors: string[] = [];
  const rel = (p: string) => relative(contentDir, p);

  function load<T extends z.ZodTypeAny>(schema: T, file: string): z.infer<T> | null {
    let raw: unknown;
    try {
      raw = parse(readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${rel(file)}: YAML parse error: ${(e as Error).message}`);
      return null;
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${rel(file)}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      return null;
    }
    return result.data;
  }

  const modules: z.infer<typeof Module>[] = [];
  const activities: z.infer<typeof Activity>[] = [];
  const files = new Map<string, string>(); // activity id -> file

  const modulesDir = join(contentDir, 'modules');
  for (const dir of readdirSync(modulesDir).sort()) {
    const moduleFile = join(modulesDir, dir, 'module.yaml');
    if (!existsSync(moduleFile)) {
      errors.push(`modules/${dir}: missing module.yaml`);
      continue;
    }
    const mod = load(Module, moduleFile);
    if (mod) {
      if (mod.slug !== dir) errors.push(`${rel(moduleFile)}: slug "${mod.slug}" must match folder "${dir}"`);
      modules.push(mod);
    }
    for (const file of walk(join(modulesDir, dir))) {
      if (file === moduleFile) continue;
      const activity = load(Activity, file);
      if (!activity) continue;
      if (activity.module !== dir) {
        errors.push(`${rel(file)}: module "${activity.module}" must match folder "${dir}"`);
      }
      activities.push(activity);
      if (files.has(activity.id)) errors.push(`${rel(file)}: duplicate id "${activity.id}" (also in ${files.get(activity.id)})`);
      files.set(activity.id, rel(file));
    }
  }

  const globalDir = join(contentDir, 'global');
  const checkins = load(Checkins, join(globalDir, 'checkins.yaml'));
  const resources = load(z.array(Resource), join(globalDir, 'resources.yaml'));
  for (const file of walk(globalDir)) {
    if (['checkins.yaml', 'resources.yaml'].includes(basename(file))) continue;
    const activity = load(Activity, file);
    if (!activity) continue;
    if (activity.module !== 'global') errors.push(`${rel(file)}: module must be "global"`);
    activities.push(activity);
    if (files.has(activity.id)) errors.push(`${rel(file)}: duplicate id "${activity.id}" (also in ${files.get(activity.id)})`);
    files.set(activity.id, rel(file));
  }

  // ---------------------------------------------------- cross-reference checks
  const ids = new Set(activities.map((a) => a.id));
  const moduleSlugs = new Set(modules.map((m) => m.slug));
  const orders = new Map<number, string>();

  for (const m of modules) {
    if (orders.has(m.order)) errors.push(`modules/${m.slug}: order ${m.order} also used by ${orders.get(m.order)}`);
    orders.set(m.order, m.slug);
    if (m.status !== 'draft') {
      for (const [type, min] of Object.entries(PUBLISH_MINIMUMS)) {
        const count = activities.filter((a) => a.module === m.slug && a.type === type).length;
        if (count < min) errors.push(`modules/${m.slug}: status "${m.status}" requires >= ${min} ${type}(s), found ${count}`);
      }
    }
  }

  for (const a of activities) {
    const where = files.get(a.id);
    if (a.type === 'assessment') {
      const subscaleIds = new Set(a.subscales.map((s) => s.id));
      for (const item of a.items) {
        if (!subscaleIds.has(item.subscale)) errors.push(`${where}: item "${item.id}" has unknown subscale "${item.subscale}"`);
        if (item.flagAtOrAbove !== undefined && (item.flagAtOrAbove < a.scale.min || item.flagAtOrAbove > a.scale.max)) {
          errors.push(`${where}: item "${item.id}" flagAtOrAbove is outside the scale`);
        }
      }
      const itemIds = a.items.map((i) => i.id);
      if (new Set(itemIds).size !== itemIds.length) errors.push(`${where}: duplicate item ids`);
      for (const s of a.subscales) {
        if (!a.items.some((i) => i.subscale === s.id)) errors.push(`${where}: subscale "${s.id}" has no items`);
        for (const r of s.recommend) if (!ids.has(r)) errors.push(`${where}: subscale "${s.id}" recommends unknown activity "${r}"`);
        if (s.module && !moduleSlugs.has(s.module)) errors.push(`${where}: subscale "${s.id}" points to unknown module "${s.module}"`);
      }
      if (a.scale.labels.length !== a.scale.max - a.scale.min + 1) {
        errors.push(`${where}: scale needs exactly ${a.scale.max - a.scale.min + 1} labels`);
      }
      if (!a.bands.some((b) => b.min === 0)) errors.push(`${where}: needs a band starting at 0`);
    }
    if (a.type === 'exercise') {
      for (const step of a.steps) {
        if (['choice', 'multi', 'scale'].includes(step.kind) && !step.options?.length) {
          errors.push(`${where}: step "${step.id}" (${step.kind}) needs options`);
        }
        if (step.kind === 'timer' && !step.seconds) errors.push(`${where}: timer step "${step.id}" needs seconds`);
      }
    }
    if (a.type === 'conversation') {
      for (const p of a.phases) {
        if (p.kind === 'turn' && !p.speaker) errors.push(`${where}: turn phase "${p.id}" needs a speaker`);
      }
    }
  }

  for (const a of activities) {
    if (a.module === 'global' || !['assessment', 'lesson', 'exercise', 'conversation'].includes(a.type)) continue;
    const m = modules.find((x) => x.slug === a.module);
    const titles = m ? [m.outline.assessment, ...m.outline.lessons, ...m.outline.exercises, ...m.outline.conversations] : [];
    if (m && !titles.includes(a.title)) errors.push(`${files.get(a.id)}: title "${a.title}" is not in the module outline`);
  }

  if (checkins && !ids.has(checkins.weekly.conversation)) {
    errors.push(`global/checkins.yaml: weekly conversation "${checkins.weekly.conversation}" not found`);
  }
  for (const kind of ['onboarding', 'safety'] as const) {
    const count = activities.filter((a) => a.type === 'assessment' && a.kind === kind).length;
    if (count !== 1) errors.push(`global: expected exactly one ${kind} assessment, found ${count}`);
  }

  if (errors.length || !checkins || !resources) return { bundle: null, errors };

  modules.sort((a, b) => a.order - b.order);
  // Within a module, keep the authored order of the outline (unknown titles last).
  const outlinePos = new Map<string, number>();
  for (const m of modules) {
    const titles = [m.outline.assessment, ...m.outline.lessons, ...m.outline.exercises, ...m.outline.conversations];
    titles.forEach((t, i) => outlinePos.set(`${m.slug}::${t}`, i));
  }
  const pos = (a: z.infer<typeof Activity>) => outlinePos.get(`${a.module}::${a.title}`) ?? Number.MAX_SAFE_INTEGER;
  activities.sort((a, b) => (a.module === b.module ? pos(a) - pos(b) : 0));
  const body = { modules, activities, checkins, resources };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  const bundle = ContentBundle.parse({ version, ...body });
  return { bundle, errors };
}

function main() {
  const check = process.argv.includes('--check');
  const { bundle, errors } = buildBundle();
  if (!bundle) {
    console.error(`Content validation failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const json = JSON.stringify(bundle, null, 2) + '\n';
  const summary = `${bundle.modules.length} modules, ${bundle.activities.length} activities (version ${bundle.version})`;

  if (check) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
    if (current !== json) {
      console.error(`Content bundle is stale. Run \`pnpm content:build\` and commit ${relative(ROOT, OUTPUT)}.`);
      process.exit(1);
    }
    console.log(`Content OK: ${summary}`);
    return;
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, json);
  console.log(`Wrote ${relative(ROOT, OUTPUT)}: ${summary}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
