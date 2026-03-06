// ── Workspaces ────────────────────────────────────────────────────────────────

export type DocumentKind = 'E14_SENADO' | 'E14_CAMARA'

export type DocumentStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE'

export interface WorkspaceDocumentEntry {
  blob_name: string
  status: DocumentStatus
}

export interface Workspace {
  id: string
  name: string
  container_name: string
  document_kind: DocumentKind
  model_name: string
  total_documents: number
  total_done: number
  documents: WorkspaceDocumentEntry[]
  created_at: string
  updated_at: string
}

export interface CreateWorkspaceRequest {
  name: string
  document_kind: DocumentKind
  model_name: string
}

// ── Document metadata (from blob _document.json) ────────────────────────────

export interface PageMeta {
  page_number: number
  width_px: number
  height_px: number
  width_inch: number
  height_inch: number
}

export interface DocumentMeta {
  original_filename: string
  document_kind: string
  page_count: number
  pages: PageMeta[]
  status: string
  total_annotations: number
}

// ── Annotations ───────────────────────────────────────────────────────────────

export interface BoundingBox {
  x_min: number
  y_min: number
  x_max: number
  y_max: number
}

export interface Annotation {
  id: string
  page_number: number
  label: string
  bbox: BoundingBox
  value_string: string
  confidence: number
  created_at: string
  updated_at: string
}

export interface CreateAnnotationRequest {
  page_number: number
  label: string
  bbox: BoundingBox
  value_string: string
}

export interface UpdateAnnotationRequest {
  label?: string
  bbox?: BoundingBox
  value_string?: string
}

// ── Label schema (legacy — will be replaced by workspace labels) ─────────────

export interface LabelDefinition {
  name: string
  color: string
  description: string
}

export interface LabelSchema {
  id: string
  name: string
  labels: LabelDefinition[]
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface ExportLabelsResponse {
  labels_blob: string
  workspace_id: string
}
