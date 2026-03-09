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
  labels: LabelDefinition[]
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
  labels?: LabelDefinition[]
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
  text_type?: 'handwritten' | 'printed' | 'unknown'
  source?: 'manual' | 'layout_detection' | 'ocr' | 'auto_label'
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
  label_type?: 'text' | 'table' | 'signature'
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

// ── Layout Detector (layout-detector service) ─────────────────────────────────

export interface LayoutBoundingBoxDto {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface LayoutDetectedRegionDto {
  region_type: string
  bounding_box: LayoutBoundingBoxDto
  confidence: number
}

export interface LayoutPageResultDto {
  page_number: number
  regions: LayoutDetectedRegionDto[]
  processing_time_ms: number
}

export interface LayoutDetectResponse {
  document_id: string
  total_pages: number
  results: LayoutPageResultDto[]
  total_processing_time_ms: number
}

// ── Text Detector / OCR (text-detector service) ───────────────────────────────

export interface OcrExtractionDto {
  region_id: string
  page_number: number
  region_label: string
  text: string
  text_type: 'handwritten' | 'printed' | 'unknown'
  bounding_box: LayoutBoundingBoxDto
  confidence: number
}

export interface OcrPageResultDto {
  page_number: number
  extractions: OcrExtractionDto[]
  processing_time_ms: number
}

export interface ExtractTextResponse {
  document_id: string
  total_pages: number
  total_extractions: number
  results: OcrPageResultDto[]
  total_processing_time_ms: number
}

// ── Scan (unified Surya OCR) ────────────────────────────────────────────────

export interface ScanLineDto {
  text: string
  bounding_box: LayoutBoundingBoxDto
  confidence: number
}

export interface ScanPageResult {
  page_number: number
  lines: ScanLineDto[]
}

export interface ScanResponse {
  total_lines: number
  results: ScanPageResult[]
}

export interface ScanAllResponse {
  total_lines: number
  total_pages_scanned: number
  results: ScanPageResult[]
}

// ── OCR Overlay (client-side, not yet an annotation) ─────────────────────────

export interface OcrOverlay {
  id: string
  text: string
  bbox: BoundingBox
  confidence: number
  isTable: boolean
}

// ── Table cell with positional data (for training) ───────────────────────────

export interface CellData {
  text: string
  bbox: BoundingBox | null  // null if manually added/edited
}

export interface AssembleTableResponse {
  columns: string[]
  rows: CellData[][]
}

// ── Training ──────────────────────────────────────────────────────────────

export type TrainingStatus = 'PENDING' | 'PREPARING' | 'UPLOADING' | 'TRAINING' | 'COMPLETED' | 'FAILED'

export interface TrainingJob {
  id: string
  workspace_id: string
  status: TrainingStatus
  model_name: string
  training_type: string
  document_type: string
  document_count: number
  error_message?: string
  metrics?: Record<string, unknown>
  created_at: string
  updated_at?: string
  started_at?: string
  completed_at?: string
}

export interface StartTrainingResponse {
  id: string
  status: string
  model_name: string
  workspace_id: string
}

// ── Auto-label (from reference document) ──────────────────────────────────

export interface AutoLabelPageResult {
  page_number: number
  annotations_created: number
}

export interface AutoLabelResponse {
  total_annotations: number
  pages: AutoLabelPageResult[]
}
