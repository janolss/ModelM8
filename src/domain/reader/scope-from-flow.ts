import type { FlowStep } from "../../api/types.js";
import {
  ACTIVITY_TYPES,
  BUSINESS_OBJECT_TYPES,
  DECISION_TYPES,
  PROCESS_OBJECT_TYPES,
} from "../../util/model-type-sets.js";
import { normType } from "./vertex-utils.js";

export type DetailProcessScopeCore = {
  modelId: string;
  processTitle: string;
  processSymbolId?: string;
  inputs: Array<{ title: string; symbolId?: string }>;
  outputs: Array<{ title: string; symbolId?: string }>;
  secondaryOutputs: Array<{ title: string; symbolId?: string }>;
};

/** Derive process I/O scope from a flow (no narrative / no extra overview fetch). */
export function scopeFromFlow(
  modelId: string,
  flow: {
    steps: FlowStep[];
    modelTitle?: string;
  },
): DetailProcessScopeCore {
  const steps = flow.steps;
  const businessObjects = steps.filter((s) => BUSINESS_OBJECT_TYPES.has(normType(s.objectType)));
  const continuesFlow = (o: { objectType?: string }) => {
    const t = normType(o.objectType);
    return (
      ACTIVITY_TYPES.has(t) ||
      DECISION_TYPES.has(t) ||
      BUSINESS_OBJECT_TYPES.has(t) ||
      PROCESS_OBJECT_TYPES.has(t)
    );
  };
  const processInputs = businessObjects.filter(
    (bo) => !(bo.inputs ?? []).some((i) => ACTIVITY_TYPES.has(normType(i.objectType))),
  );
  const terminalOutputs = businessObjects.filter((bo) => {
    const fromActivity = (bo.inputs ?? []).some((i) => ACTIVITY_TYPES.has(normType(i.objectType)));
    const noFurther = !(bo.outputs ?? []).some((o) => continuesFlow(o));
    return fromActivity && noFurther;
  });
  const sortedTerminals = terminalOutputs
    .slice()
    .sort((a, b) => (b.x ?? 0) - (a.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));
  const primaryX = sortedTerminals[0]?.x ?? 0;
  const processOutputs = sortedTerminals.filter((bo) => Math.abs((bo.x ?? 0) - primaryX) < 40);
  const secondaryOutputs = sortedTerminals.filter((bo) => Math.abs((bo.x ?? 0) - primaryX) >= 40);
  const processChevron = steps.find(
    (s) => PROCESS_OBJECT_TYPES.has(normType(s.objectType)) && (s.x ?? 999) < 100,
  );
  const processTitle = processChevron?.title ?? flow.modelTitle ?? "Okänd process";
  return {
    modelId,
    processTitle,
    processSymbolId: processChevron?.symbolId,
    inputs: processInputs
      .filter((i): i is FlowStep & { title: string } => Boolean(i.title))
      .map((i) => ({ title: i.title!, symbolId: i.symbolId })),
    outputs: processOutputs
      .filter((o): o is FlowStep & { title: string } => Boolean(o.title))
      .map((o) => ({ title: o.title!, symbolId: o.symbolId })),
    secondaryOutputs: secondaryOutputs
      .filter((o): o is FlowStep & { title: string } => Boolean(o.title))
      .map((o) => ({ title: o.title!, symbolId: o.symbolId })),
  };
}
