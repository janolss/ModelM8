import createHyphenator from "hyphen";
/** Compiled TeX pattern blob (runtime shape differs from @types PatternsDefinition). */
import svPatterns from "hyphen/patterns/sv.js";

/** 2c8 soft line-break (UI often shows this as "¬"). */
export const SOFT_HYPHEN = "\u00AD";
const SOFT_BREAK_RE = /[\u00AC\u00AD]/g;
const MIN_TOKEN_LEN = 12;

/**
 * Domain compounds: hard "-" marks preferred break(s).
 * TeX Swedish patterns often miss compound boundaries (e.g. leverans|överlämning).
 */
const HYPHEN_EXCEPTIONS = ["leverans-överlämning", "personal-ansvarig", "service-tekniker"];

/**
 * Role/process suffixes: prefer break immediately before these when stem is long enough.
 */
const PREFERRED_SUFFIXES = [
  "ansvarig",
  "tekniker",
  "liggare",
  "medarbetare",
  "chef",
  "handläggare",
  "koordinator",
  "specialist",
  "överlämning",
];

const hyphenateSv = createHyphenator(svPatterns as never, {
  exceptions: HYPHEN_EXCEPTIONS,
}) as (text: string, options?: { minWordLength?: number }) => string;

export function stripSoftBreaks(title: string): string {
  return title.replace(SOFT_BREAK_RE, "");
}

/** Map UI "¬" to soft hyphen used in symbol rawTitle. */
export function normalizeSoftBreaks(title: string): string {
  return title.replace(/\u00AC/g, SOFT_HYPHEN);
}

/** Prefer compound/suffix boundary closest to mid-word among soft-hyphen candidates. */
function pickSingleBreak(token: string): string {
  const lower = token.toLowerCase();

  for (const suf of PREFERRED_SUFFIXES) {
    if (lower.endsWith(suf) && lower.length - suf.length >= 4 && lower !== suf) {
      const cut = token.length - suf.length;
      return `${token.slice(0, cut)}${SOFT_HYPHEN}${token.slice(cut)}`;
    }
  }

  const fully = hyphenateSv(token, { minWordLength: 5 });
  const parts = fully.split(SOFT_HYPHEN);
  if (parts.length < 2) {
    return token;
  }

  // One ¬ for compact 2c8 labels: choose cut nearest mid-point
  const mid = token.length / 2;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i].length;
    const dist = Math.abs(acc - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  const left = parts.slice(0, bestIdx + 1).join("");
  const right = parts.slice(bestIdx + 1).join("");
  return `${left}${SOFT_HYPHEN}${right}`;
}

/**
 * Insert soft hyphens in long Swedish compounds so outside labels wrap
 * (e.g. Personal­ansvarig, leverans­överlämning). Preserves existing breaks.
 */
export function applySoftBreaks(title: string): string {
  const normalized = normalizeSoftBreaks(title.trim());
  if (/[\u00AC\u00AD]/.test(normalized)) {
    return normalized;
  }

  return normalized
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part.length < MIN_TOKEN_LEN) {
        return part;
      }
      return pickSingleBreak(part);
    })
    .join("");
}
