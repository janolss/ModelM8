/** Lightweight OpenAPI-aligned types used by domain services. */

export interface Page<T> {
  startAt?: number;
  maxResults?: number;
  total?: number;
  data?: T[];
}

export interface LocalizedTitle {
  title?: string;
  rawTitle?: string;
  [key: string]: unknown;
}

export interface ModelView {
  uuid?: string;
  modelType?: string;
  titles?: Record<string, LocalizedTitle>;
  version?: number;
  [key: string]: unknown;
}

export interface SymbolView {
  uuid?: string;
  objectType?: string;
  titles?: Record<string, LocalizedTitle>;
  documents?: unknown[];
  breakdowns?: unknown[];
  [key: string]: unknown;
}

export interface VertexView {
  uuid?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  symbol?: string | SymbolView;
  objectType?: string;
  layer?: string;
  labels?: Record<string, LocalizedTitle>;
  inputs?: unknown[];
  outputs?: unknown[];
  breakdowns?: unknown[];
  hasDocument?: boolean;
  [key: string]: unknown;
}

export interface EdgeView {
  uuid?: string;
  edgeType?: string;
  fromVertex?: string;
  toVertex?: string;
  [key: string]: unknown;
}

export interface CanvasDto {
  workflowState?: string;
  vertices?: VertexView[];
  edges?: EdgeView[];
  layerZOrder?: string[];
  swimlaneSettings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BreakdownView {
  uuid?: string;
  symbol?: unknown;
  edge?: unknown;
  [key: string]: unknown;
}

export interface DocumentRootView {
  uuid?: string;
  titles?: Record<string, LocalizedTitle>;
  type?: string;
  key?: string;
  value?: string;
  [key: string]: unknown;
}

export interface DocumentTypeView {
  uuid?: string;
  titles?: Record<string, LocalizedTitle>;
  [key: string]: unknown;
}

export interface FlowStepRef {
  vertexId?: string;
  symbolId?: string;
  objectType?: string;
  title?: string;
}

export interface FlowStep {
  vertexId?: string;
  symbolId?: string;
  objectType?: string;
  title?: string;
  x?: number;
  y?: number;
  hasDocument?: boolean;
  documents?: Array<{ id: string; title?: string }>;
  inputs?: FlowStepRef[];
  outputs?: FlowStepRef[];
  responsible?: FlowStepRef[];
  applications?: FlowStepRef[];
  /** Governing/steering documents (CONTROLS edges), e.g. checklists */
  controls?: FlowStepRef[];
  controlledBy?: FlowStepRef[];
  otherRelations?: Array<FlowStepRef & { edgeType?: string; direction?: string }>;
  outgoing?: Array<{
    edgeId?: string;
    edgeType?: string;
    toVertexId?: string;
    toTitle?: string;
    toObjectType?: string;
  }>;
}
