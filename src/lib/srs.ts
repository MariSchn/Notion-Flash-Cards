import type { Grade } from "./types";

export type SrsState = {
  interval_days: number;
  ease: number;
  repetitions: number;
  lapses: number;
};

export type SrsResult = SrsState & {
  due_at: string;
  last_reviewed_at: string;
};

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365 * 2;

/** Adds a little jitter so cards learned together don't stay clumped forever. */
function fuzz(days: number): number {
  if (days < 2.5) return days;
  const spread = Math.max(0.5, days * 0.05);
  return days + (Math.random() * 2 - 1) * spread;
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.min(3.2, ease));
}

/**
 * SM-2 with an Anki-flavoured four-button grading.
 *
 * `Again` resets the card to learning and drops it back into the current
 * session's queue (the caller handles the requeue); the other grades schedule
 * the card into the future.
 */
export function schedule(
  state: SrsState,
  grade: Grade,
  now = new Date(),
  { jitter = true }: { jitter?: boolean } = {},
): SrsResult {
  let { interval_days: interval, ease, repetitions, lapses } = state;

  switch (grade) {
    case 0:
      ease = clampEase(ease - 0.2);
      lapses += 1;
      repetitions = 0;
      interval = 0;
      break;

    case 1:
      ease = clampEase(ease - 0.15);
      interval = repetitions === 0 ? 0.5 : Math.max(1, interval * 1.2);
      repetitions += 1;
      break;

    case 2:
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 3;
      else interval = interval * ease;
      repetitions += 1;
      break;

    case 3:
      ease = clampEase(ease + 0.15);
      if (repetitions === 0) interval = 4;
      else if (repetitions === 1) interval = 5;
      else interval = interval * ease * 1.3;
      repetitions += 1;
      break;
  }

  interval = Math.min(MAX_INTERVAL_DAYS, jitter ? fuzz(interval) : interval);

  // A lapsed card comes back in ten minutes; anything else lands on a future day.
  const dueMs =
    grade === 0
      ? now.getTime() + 10 * 60 * 1000
      : now.getTime() + interval * 24 * 60 * 60 * 1000;

  return {
    interval_days: interval,
    ease,
    repetitions,
    lapses,
    due_at: new Date(dueMs).toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

/** Human-readable "next review" label shown on the grading buttons. */
export function previewInterval(state: SrsState, grade: Grade): string {
  if (grade === 0) return "10m";
  const { interval_days } = schedule({ ...state }, grade, new Date(), { jitter: false });
  const d = interval_days;
  if (d * 24 * 60 < 60) return `${Math.max(1, Math.round(d * 24 * 60))}m`;
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(d < 60 ? 1 : 0)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
