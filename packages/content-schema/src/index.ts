/**
 * Content schema for the Repair activity library.
 *
 * All clinical/educational content lives in /content as YAML, is validated
 * against these schemas by scripts/build-content.ts, and is compiled into a
 * single JSON bundle consumed by the mobile app (and synced to Supabase).
 */
import { z } from 'zod';

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case (a-z, 0-9, -)');

export const Intensity = z.enum(['light', 'medium', 'deep']);
export const Mode = z.enum(['solo', 'together', 'either']);
export const Status = z.enum(['draft', 'in_review', 'published']);
export const Tier = z.enum(['A', 'B', 'C', 'D']);

export const TIER_LABELS: Record<z.infer<typeof Tier>, string> = {
  A: 'Start here: stabilize',
  B: 'Repair',
  C: 'Reconnect',
  D: 'Specific stressors',
};

/** Fields shared by every activity in the library. */
const activityBase = {
  id: slug,
  module: slug, // module slug, or "global"
  title: z.string().min(1),
  summary: z.string().min(1),
  minutes: z.number().int().positive(),
  mode: Mode,
  intensity: Intensity.default('medium'),
};

// ---------------------------------------------------------------- Assessment

export const AssessmentItem = z.object({
  id: slug,
  text: z.string().min(1),
  subscale: slug,
  /** When true, a high answer means LOW concern (score is flipped). */
  reverse: z.boolean().default(false),
  /** Safety screens only: answering at or above this value raises a flag. */
  flagAtOrAbove: z.number().int().optional(),
});

export const Subscale = z.object({
  id: slug,
  label: z.string(),
  description: z.string().optional(),
  /** Onboarding check: which module this subscale points toward. */
  module: slug.optional(),
  /** Concern score (0-100) at/above which `recommend` activities are suggested. */
  threshold: z.number().min(0).max(100).default(50),
  recommend: z.array(slug).default([]),
  /**
   * Never shown in partner comparisons, even when both opt in (for example
   * affair-related or stay-or-go subscales). Used only for private routing.
   */
  sensitive: z.boolean().default(false),
});

export const Band = z.object({
  id: slug,
  label: z.string(),
  /** Inclusive lower bound of the overall concern score (0-100). */
  min: z.number().min(0).max(100),
  narrative: z.string(),
  /** Show a "consider working with a couples therapist" prompt. */
  suggestTherapist: z.boolean().default(false),
});

export const Assessment = z.object({
  ...activityBase,
  type: z.literal('assessment'),
  kind: z.enum(['standard', 'onboarding', 'safety']).default('standard'),
  intro: z.string(),
  scale: z.object({
    min: z.number().int(),
    max: z.number().int(),
    labels: z.array(z.string()).min(2),
  }),
  subscales: z.array(Subscale).min(1),
  items: z.array(AssessmentItem).min(3),
  /** Bands over the overall concern score; sorted ascending by `min`. */
  bands: z.array(Band).min(1),
  /** Partner comparison: highlight subscales whose gap is at least this. */
  gapThreshold: z.number().min(0).max(100).default(25),
});

// -------------------------------------------------------------------- Lesson

export const Lesson = z.object({
  ...activityBase,
  type: z.literal('lesson'),
  cards: z
    .array(z.object({ heading: z.string().optional(), body: z.string().min(1) }))
    .min(2),
  takeaway: z.object({
    question: z.string(),
    options: z.array(z.string()).min(2),
    /** Index of the best answer, if there is one; otherwise it is a reflection. */
    answer: z.number().int().optional(),
    explanation: z.string().optional(),
  }),
  sources: z.array(z.string()).default([]),
});

// ------------------------------------------------------------------ Exercise

export const ExerciseStep = z.object({
  id: slug,
  kind: z.enum(['instruction', 'text', 'list', 'choice', 'multi', 'scale', 'timer']),
  prompt: z.string(),
  help: z.string().optional(),
  options: z.array(z.string()).optional(),
  seconds: z.number().int().positive().optional(),
  /** Never shared with a partner, regardless of activity visibility. */
  alwaysPrivate: z.boolean().default(false),
});

export const Exercise = z.object({
  ...activityBase,
  type: z.literal('exercise'),
  intro: z.string(),
  steps: z.array(ExerciseStep).min(1),
  outro: z.string().optional(),
});

// -------------------------------------------------------- Conversation guide

export const ConversationPhase = z.object({
  id: slug,
  title: z.string(),
  kind: z.enum(['prep', 'turn', 'together', 'close']),
  /** For `turn` phases. A = the partner who starts. */
  speaker: z.enum(['A', 'B']).optional(),
  /** Speaker prompts (or shared prompts for prep/together/close). */
  prompts: z.array(z.string()).min(1),
  /** Guidance for the listener during a `turn`. */
  listenerPrompts: z.array(z.string()).default([]),
  seconds: z.number().int().positive().optional(),
});

export const Conversation = z.object({
  ...activityBase,
  type: z.literal('conversation'),
  intro: z.string(),
  groundRules: z.array(z.string()).min(1),
  phases: z.array(ConversationPhase).min(2),
});

// ------------------------------------------------------- Journal and ritual

export const Journal = z.object({
  ...activityBase,
  type: z.literal('journal'),
  intro: z.string(),
  prompts: z.array(z.string()).min(1),
});

export const Ritual = z.object({
  ...activityBase,
  type: z.literal('ritual'),
  intro: z.string(),
  days: z.array(z.object({ day: z.number().int().positive(), task: z.string() })).min(1),
});

export const Activity = z.discriminatedUnion('type', [
  Assessment,
  Lesson,
  Exercise,
  Conversation,
  Journal,
  Ritual,
]);

// -------------------------------------------------------------------- Module

export const Module = z.object({
  slug,
  title: z.string(),
  tier: Tier,
  order: z.number().int().positive(),
  tagline: z.string(),
  description: z.string(),
  status: Status,
  intensity: Intensity,
  gating: z
    .object({
      adultsOnly: z.boolean().default(false),
      /** Each partner must privately confirm all of these before entry. */
      confirmations: z.array(z.string()).default([]),
      therapistRecommended: z.boolean().default(false),
      /** Hidden entirely while a user's safety mode is on. */
      hiddenInSafetyMode: z.boolean().default(false),
    })
    .default({}),
  /** Planned content (titles), used to track authoring progress for drafts. */
  outline: z.object({
    assessment: z.string(),
    lessons: z.array(z.string()).min(1),
    exercises: z.array(z.string()).min(1),
    conversations: z.array(z.string()).min(1),
    journal: z.string().optional(),
    ritual: z.string().optional(),
  }),
});

/** Minimum authored content required before a module may be `published`. */
export const PUBLISH_MINIMUMS = {
  assessment: 1,
  lesson: 4,
  exercise: 3,
  conversation: 2,
} as const;

export const CheckinQuestion = z.object({
  id: slug,
  text: z.string(),
  kind: z.enum(['scale', 'choice', 'text']),
  labels: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
});

export const Checkins = z.object({
  daily: z.array(CheckinQuestion).min(1),
  weekly: z.object({
    conversation: slug,
    questions: z.array(CheckinQuestion).min(1),
  }),
});

export const Resource = z.object({
  id: slug,
  name: z.string(),
  description: z.string(),
  phone: z.string().optional(),
  text: z.string().optional(),
  url: z.string().url().optional(),
  region: z.string().default('US'),
  category: z.enum(['crisis', 'safety', 'therapy', 'other']),
});

export const ContentBundle = z.object({
  version: z.string(),
  modules: z.array(Module),
  activities: z.array(Activity),
  checkins: Checkins,
  resources: z.array(Resource),
});

export type Intensity = z.infer<typeof Intensity>;
export type Mode = z.infer<typeof Mode>;
export type Tier = z.infer<typeof Tier>;
export type Module = z.infer<typeof Module>;
export type Assessment = z.infer<typeof Assessment>;
export type AssessmentItem = z.infer<typeof AssessmentItem>;
export type Subscale = z.infer<typeof Subscale>;
export type Band = z.infer<typeof Band>;
export type Lesson = z.infer<typeof Lesson>;
export type Exercise = z.infer<typeof Exercise>;
export type ExerciseStep = z.infer<typeof ExerciseStep>;
export type Conversation = z.infer<typeof Conversation>;
export type ConversationPhase = z.infer<typeof ConversationPhase>;
export type Journal = z.infer<typeof Journal>;
export type Ritual = z.infer<typeof Ritual>;
export type Activity = z.infer<typeof Activity>;
export type ActivityType = Activity['type'];
export type Checkins = z.infer<typeof Checkins>;
export type Resource = z.infer<typeof Resource>;
export type ContentBundle = z.infer<typeof ContentBundle>;
