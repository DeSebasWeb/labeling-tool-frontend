import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspacesApi } from '../api/workspaces'
import type { Annotation, BoundingBox, ScanLineDto, OcrOverlay, CellData } from '../types/api'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { Toast } from '../components/ui/Toast'
import { TableEditorModal } from '../components/TableEditorModal'
import type { TableAnnotation } from '../components/TableEditorModal'

function scanLinesToOverlays(lines: ScanLineDto[]): OcrOverlay[] {
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    text: line.text,
    bbox: {
      x_min: Math.round(line.bounding_box.x1),
      y_min: Math.round(line.bounding_box.y1),
      x_max: Math.round(line.bounding_box.x2),
      y_max: Math.round(line.bounding_box.y2),
    },
    confidence: line.confidence,
    isTable: /\t|\|/.test(line.text) || (line.text.split('\n').length > 2),
  }))
}

const E14_DEFAULT_COLUMNS = [
  'IDCandidato1', 'Casilla1', 'Casilla2', 'Casilla3',
  'IDCandidato2', 'Casilla4', 'Casilla5', 'Casilla6',
  'IDCandidato3', 'Casilla7', 'Casilla8', 'Casilla9',
]

function defaultColumnName(index: number): string {
  return E14_DEFAULT_COLUMNS[index] ?? `Col ${index + 1}`
}

function parseTextToTable(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(Boolean)
  if (!lines.length) return { columns: ['Col 1'], rows: [['']] }
  const rows = lines.map((l) => l.split(/\t|\|/).map((s) => s.trim()))
  const maxCols = Math.max(...rows.map((r) => r.length))
  const padded = rows.map((r) => [...r, ...Array(maxCols - r.length).fill('')])
  return { columns: padded[0].map((_, i) => defaultColumnName(i)), rows: padded }
}

function overlapsAnnotation(ov: OcrOverlay, annotations: Annotation[]): boolean {
  const cx = (ov.bbox.x_min + ov.bbox.x_max) / 2
  const cy = (ov.bbox.y_min + ov.bbox.y_max) / 2
  return annotations.some(
    (a) => cx >= a.bbox.x_min && cx <= a.bbox.x_max && cy >= a.bbox.y_min && cy <= a.bbox.y_max,
  )
}

/** Extract individual cells with bbox from a table annotation's value_string */
function getTableCells(ann: Annotation): { text: string; bbox: BoundingBox; annId: string; label: string }[] {
  try {
    const parsed = JSON.parse(ann.value_string)
    const rows: CellData[][] | undefined = parsed.rows
    if (!rows) return []
    const cells: { text: string; bbox: BoundingBox; annId: string; label: string }[] = []
    for (const row of rows) {
      for (const cell of row) {
        if (cell.bbox && cell.text) {
          cells.push({ text: cell.text, bbox: cell.bbox, annId: ann.id, label: ann.label })
        }
      }
    }
    return cells
  } catch {
    return []
  }
}

type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br'

const CORNER_HIT_RADIUS = 10

function getCornerAt(x: number, y: number, bbox: BoundingBox): ResizeCorner | null {
  const { x_min, y_min, x_max, y_max } = bbox
  const r = CORNER_HIT_RADIUS
  if (Math.abs(x - x_min) <= r && Math.abs(y - y_min) <= r) return 'tl'
  if (Math.abs(x - x_max) <= r && Math.abs(y - y_min) <= r) return 'tr'
  if (Math.abs(x - x_min) <= r && Math.abs(y - y_max) <= r) return 'bl'
  if (Math.abs(x - x_max) <= r && Math.abs(y - y_max) <= r) return 'br'
  return null
}

function applyResize(original: BoundingBox, corner: ResizeCorner, x: number, y: number): BoundingBox {
  const b = { ...original }
  switch (corner) {
    case 'tl': b.x_min = Math.min(x, b.x_max - 5); b.y_min = Math.min(y, b.y_max - 5); break
    case 'tr': b.x_max = Math.max(x, b.x_min + 5); b.y_min = Math.min(y, b.y_max - 5); break
    case 'bl': b.x_min = Math.min(x, b.x_max - 5); b.y_max = Math.max(y, b.y_min + 5); break
    case 'br': b.x_max = Math.max(x, b.x_min + 5); b.y_max = Math.max(y, b.y_min + 5); break
  }
  return { x_min: Math.round(b.x_min), y_min: Math.round(b.y_min), x_max: Math.round(b.x_max), y_max: Math.round(b.y_max) }
}

const CORNER_CURSOR: Record<ResizeCorner, string> = {
  tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize',
}

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}

interface ResizeState {
  annotationId: string
  corner: ResizeCorner
  originalBbox: BoundingBox
  currentBbox: BoundingBox
}

const ScanIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5Z" />
  </svg>
)

const BackIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
)

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
)

export default function EditorPage() {
  const { workspaceId, blobName } = useParams<{ workspaceId: string; blobName: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const decodedBlob = blobName ? decodeURIComponent(blobName) : ''

  const [currentPage, setCurrentPage] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [pendingBbox, setPendingBbox] = useState<BoundingBox | null>(null)
  const [pendingTableLabel, setPendingTableLabel] = useState<{ labelName: string; bbox: BoundingBox; initialData?: { columns: string[]; rows: CellData[][] | string[][] } } | null>(null)
  const [editingTableAnnotation, setEditingTableAnnotation] = useState<{ annotationId: string; labelName: string; bbox: BoundingBox; value_string: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [labelSearch, setLabelSearch] = useState('')
  const [labelColor, setLabelColor] = useState('#2563eb')
  const [labelType, setLabelType] = useState<'text' | 'table' | 'signature'>('text')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanAllProgress, setScanAllProgress] = useState<{ current: number; total: number } | null>(null)
  const [hoveredAnnotation, setHoveredAnnotation] = useState<Annotation | null>(null)
  const [hoveredOverlay, setHoveredOverlay] = useState<OcrOverlay | null>(null)
  const [hoveredTableCell, setHoveredTableCell] = useState<{ text: string; label: string; annId: string } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  // OCR overlays por pagina (persiste al navegar entre paginas)
  const [ocrOverlaysMap, setOcrOverlaysMap] = useState<Map<number, OcrOverlay[]>>(new Map())
  // Overlay clickeado (dispara popup de labels)
  const [selectedOverlay, setSelectedOverlay] = useState<OcrOverlay | null>(null)
  // Label siendo renombrado: {name, newName}
  const [renamingLabel, setRenamingLabel] = useState<{ name: string; newName: string } | null>(null)
  // Table pick-from-image mode
  const [tablePickMode, setTablePickMode] = useState(false)
  const [tablePickedText, setTablePickedText] = useState<string | null>(null)
  // Resize annotation bbox
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const [hoveredCorner, setHoveredCorner] = useState<{ annotationId: string; corner: ResizeCorner } | null>(null)
  // Auto-label state
  const [showAutoLabel, setShowAutoLabel] = useState(false)
  const [labelsCollapsed, setLabelsCollapsed] = useState(false)
  const [selectedReference, setSelectedReference] = useState<string | null>(null)

  // Cargar workspace
  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  })

  // Cargar metadata del documento desde blob
  const { data: docMeta } = useQuery({
    queryKey: ['doc-meta', workspaceId, decodedBlob],
    queryFn: () => workspacesApi.getDocumentMeta(workspaceId!, decodedBlob),
    enabled: !!workspaceId && !!decodedBlob,
  })

  // Cargar anotaciones desde blob
  const { data: annotations = [] } = useQuery({
    queryKey: ['annotations', workspaceId, decodedBlob],
    queryFn: () => workspacesApi.listAnnotations(workspaceId!, decodedBlob),
    enabled: !!workspaceId && !!decodedBlob,
  })

  const annQueryKey = ['annotations', workspaceId, decodedBlob]

  const createAnnotation = useMutation({
    mutationFn: (body: { page_number: number; label: string; bbox: BoundingBox; value_string: string; confidence?: number; source?: string }) =>
      workspacesApi.createAnnotation(workspaceId!, decodedBlob, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: 'Anotación guardada', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al guardar la anotación', type: 'error' })
    },
  })

  const deleteAnnotationMut = useMutation({
    mutationFn: (annotationId: string) =>
      workspacesApi.deleteAnnotation(workspaceId!, decodedBlob, annotationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: 'Anotación eliminada', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al eliminar la anotación', type: 'error' })
    },
  })

  const handleDeleteAnnotation = (ann: Annotation) => {
    // Si la anotación vino de OCR, restaurar el overlay para que no se pierda
    if (ann.source === 'ocr' && ann.value_string) {
      setOcrOverlaysMap((prev) => {
        const next = new Map(prev)
        const page = next.get(ann.page_number) ?? []
        const restored: OcrOverlay = {
          id: crypto.randomUUID(),
          text: ann.value_string,
          bbox: ann.bbox,
          confidence: ann.confidence ?? 0,
          isTable: /\t|\|/.test(ann.value_string),
        }
        next.set(ann.page_number, [...page, restored])
        return next
      })
    }
    deleteAnnotationMut.mutate(ann.id)
  }

  const updateAnnotation = useMutation({
    mutationFn: ({ annotationId, body }: { annotationId: string; body: { value_string?: string; bbox?: BoundingBox } }) =>
      workspacesApi.updateAnnotation(workspaceId!, decodedBlob, annotationId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: 'Anotación actualizada', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al actualizar la anotación', type: 'error' })
    },
  })

  const addLabel = useMutation({
    mutationFn: (label: { name: string; color: string; description?: string; label_type?: string }) =>
      workspacesApi.addLabel(workspaceId!, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
    },
  })

  const removeLabelMutation = useMutation({
    mutationFn: (labelName: string) => workspacesApi.removeLabel(workspaceId!, labelName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: 'Etiqueta eliminada', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al eliminar la etiqueta', type: 'error' })
    },
  })

  const renameLabelMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      workspacesApi.updateLabel(workspaceId!, oldName, { new_name: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      qc.invalidateQueries({ queryKey: annQueryKey })
      setRenamingLabel(null)
      setToast({ message: 'Etiqueta renombrada', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al renombrar la etiqueta', type: 'error' })
    },
  })

  const autoLabelMutation = useMutation({
    mutationFn: ({ refBlob }: { refBlob: string }) =>
      workspacesApi.autoLabel(workspaceId!, decodedBlob, refBlob),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: `Auto-label: ${data.total_annotations} anotaciones en ${data.pages.length} paginas`, type: 'success' })
      setShowAutoLabel(false)
      setSelectedReference(null)
    },
    onError: () => {
      setToast({ message: 'Error al auto-etiquetar', type: 'error' })
    },
  })

  const clearAutoLabelMutation = useMutation({
    mutationFn: () =>
      workspacesApi.clearAnnotationsBySource(workspaceId!, decodedBlob, 'auto_label'),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: annQueryKey })
      setToast({ message: `${data.deleted} anotaciones auto-etiquetadas eliminadas`, type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Error al eliminar auto-etiquetado', type: 'error' })
    },
  })

  const hasAutoLabelAnnotations = annotations.some((a) => a.source === 'auto_label')

  const totalPages = docMeta?.page_count ?? 0
  const pageAnnotations = annotations.filter((a) => a.page_number === currentPage)
  const currentOcrOverlays = ocrOverlaysMap.get(currentPage) ?? []

  const removeOverlay = useCallback((overlayId: string) => {
    setOcrOverlaysMap((prev) => {
      const next = new Map(prev)
      const page = next.get(currentPage)
      if (page) next.set(currentPage, page.filter((o) => o.id !== overlayId))
      return next
    })
  }, [currentPage])

  // Dibujar canvas con imagen + anotaciones + drag
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    pageAnnotations.forEach((ann) => {
      const label = workspace?.labels.find((l) => l.name === ann.label)
      const color = label?.color ?? '#2563eb'
      const isTable = label?.label_type === 'table'
      const hasOcr = !!ann.value_string
      const bw = ann.bbox.x_max - ann.bbox.x_min
      const bh = ann.bbox.y_max - ann.bbox.y_min

      // Para tablas con celdas enriquecidas: dibujar grilla de celdas
      if (isTable && hasOcr) {
        const cells = getTableCells(ann)

        // Borde exterior de la tabla
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.strokeRect(ann.bbox.x_min, ann.bbox.y_min, bw, bh)
        ctx.fillStyle = color + '11'
        ctx.fillRect(ann.bbox.x_min, ann.bbox.y_min, bw, bh)

        // Label
        ctx.fillStyle = color
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(ann.label + ' \u25A6', ann.bbox.x_min + 2, ann.bbox.y_min - 3)

        // Dibujar cada celda individual
        cells.forEach((cell) => {
          const cw = cell.bbox.x_max - cell.bbox.x_min
          const ch = cell.bbox.y_max - cell.bbox.y_min

          // Borde de celda
          ctx.strokeStyle = color + '88'
          ctx.lineWidth = 1
          ctx.strokeRect(cell.bbox.x_min, cell.bbox.y_min, cw, ch)

          // Fondo de celda
          ctx.fillStyle = color + '0d'
          ctx.fillRect(cell.bbox.x_min, cell.bbox.y_min, cw, ch)

          // Texto de la celda
          ctx.fillStyle = '#0f172a'
          ctx.font = '10px monospace'
          const display = cell.text.length > 20 ? cell.text.slice(0, 20) + '\u2026' : cell.text
          ctx.fillText(display, cell.bbox.x_min + 2, cell.bbox.y_min + 11, cw - 4)
        })

        // Si no hay celdas con bbox (tabla vieja), fallback al estilo anterior
        if (cells.length === 0) {
          ctx.fillStyle = '#0f172a'
          ctx.font = '11px monospace'
          ctx.fillText('Tabla (click para editar)', ann.bbox.x_min + 3, ann.bbox.y_min + 14, bw - 6)
        }
        return
      }

      // Borde: verde si tiene OCR, color normal si no
      ctx.strokeStyle = hasOcr ? '#16a34a' : color
      ctx.lineWidth = hasOcr ? 2.5 : 2
      ctx.strokeRect(ann.bbox.x_min, ann.bbox.y_min, bw, bh)

      // Fondo: verde tenue si tiene OCR
      ctx.fillStyle = hasOcr ? '#16a34a22' : color + '33'
      ctx.fillRect(ann.bbox.x_min, ann.bbox.y_min, bw, bh)

      // Label (nombre)
      ctx.fillStyle = hasOcr ? '#16a34a' : color
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(ann.label, ann.bbox.x_min + 2, ann.bbox.y_min - 3)

      // Texto OCR extraido dentro del bbox
      if (hasOcr) {
        ctx.fillStyle = '#0f172a'
        ctx.font = '11px monospace'
        const maxW = bw - 6
        const text = ann.value_string.length > 40 ? ann.value_string.slice(0, 40) + '\u2026' : ann.value_string
        ctx.fillText(text, ann.bbox.x_min + 3, ann.bbox.y_min + 14, maxW)
        // Badge de confianza en la esquina inferior derecha
        const conf = `${Math.round((ann.confidence ?? 0) * 100)}%`
        ctx.font = 'bold 10px sans-serif'
        const confW = ctx.measureText(conf).width + 6
        ctx.fillStyle = '#16a34acc'
        ctx.fillRect(ann.bbox.x_max - confW - 2, ann.bbox.y_max - 14, confW, 12)
        ctx.fillStyle = '#fff'
        ctx.fillText(conf, ann.bbox.x_max - confW + 1, ann.bbox.y_max - 4)
      }
    })

    // Dibujar handles de esquina para redimensionar anotaciones
    pageAnnotations.forEach((ann) => {
      const effectiveBbox = resizing?.annotationId === ann.id ? resizing.currentBbox : ann.bbox
      const { x_min, y_min, x_max, y_max } = effectiveBbox
      const corners = [
        { x: x_min, y: y_min },
        { x: x_max, y: y_min },
        { x: x_min, y: y_max },
        { x: x_max, y: y_max },
      ]
      const isHovered = hoveredCorner?.annotationId === ann.id
      const isResizing = resizing?.annotationId === ann.id
      corners.forEach((c) => {
        ctx.fillStyle = isHovered || isResizing ? '#3b82f6' : '#94a3b8'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
      // Si estamos redimensionando esta anotación, dibujar el bbox provisional
      if (isResizing) {
        const rw = resizing.currentBbox.x_max - resizing.currentBbox.x_min
        const rh = resizing.currentBbox.y_max - resizing.currentBbox.y_min
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.strokeRect(resizing.currentBbox.x_min, resizing.currentBbox.y_min, rw, rh)
        ctx.setLineDash([])
      }
    })

    // Dibujar OCR overlays (sugerencias de Surya, aun no son anotaciones)
    currentOcrOverlays.forEach((ov) => {
      const bw = ov.bbox.x_max - ov.bbox.x_min
      const bh = ov.bbox.y_max - ov.bbox.y_min

      // Borde dashed amber
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(ov.bbox.x_min, ov.bbox.y_min, bw, bh)
      ctx.setLineDash([])

      // Fondo semi-transparente
      ctx.fillStyle = '#fef3c720'
      ctx.fillRect(ov.bbox.x_min, ov.bbox.y_min, bw, bh)

      // Texto detectado
      ctx.fillStyle = '#92400e'
      ctx.font = '10px monospace'
      const maxW = bw - 6
      const displayText = ov.text.length > 50 ? ov.text.slice(0, 50) + '...' : ov.text
      ctx.fillText(displayText, ov.bbox.x_min + 3, ov.bbox.y_min + 12, maxW)

      // Badge de confianza
      const conf = `${Math.round(ov.confidence * 100)}%`
      ctx.font = 'bold 9px sans-serif'
      const confW = ctx.measureText(conf).width + 4
      ctx.fillStyle = '#f59e0baa'
      ctx.fillRect(ov.bbox.x_max - confW - 1, ov.bbox.y_max - 12, confW, 11)
      ctx.fillStyle = '#fff'
      ctx.fillText(conf, ov.bbox.x_max - confW + 1, ov.bbox.y_max - 3)

      // Icono de tabla si aplica
      if (ov.isTable) {
        ctx.fillStyle = '#7c3aed'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('\u25A6', ov.bbox.x_max - 16, ov.bbox.y_min + 14)
      }
    })

    if (drag?.active) {
      const x = Math.min(drag.startX, drag.currentX)
      const y = Math.min(drag.startY, drag.currentY)
      const w = Math.abs(drag.currentX - drag.startX)
      const h = Math.abs(drag.currentY - drag.startY)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }

    if (pendingBbox) {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([2, 4])
      ctx.strokeRect(pendingBbox.x_min, pendingBbox.y_min, pendingBbox.x_max - pendingBbox.x_min, pendingBbox.y_max - pendingBbox.y_min)
      ctx.setLineDash([])
    }
  }, [pageAnnotations, drag, pendingBbox, workspace, currentOcrOverlays, resizing, hoveredCorner])

  // Cargar imagen de la página actual desde blob
  useEffect(() => {
    if (!workspaceId || !decodedBlob || totalPages === 0) return
    setImageLoading(true)
    imgRef.current = null
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImageLoading(false)
      drawCanvas()
    }
    img.onerror = () => setImageLoading(false)
    img.src = workspacesApi.pageImageUrl(workspaceId, decodedBlob, currentPage)
  }, [workspaceId, decodedBlob, currentPage, totalPages])

  // Redibujar cuando cambian anotaciones o drag
  useEffect(() => { drawCanvas() }, [drawCanvas])

  const canvasCoords = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (ev.clientX - rect.left) * (canvas.width / rect.width),
      y: (ev.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const handleMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasCoords(ev)
    // Check if clicking on a corner handle to resize
    for (const ann of pageAnnotations) {
      const corner = getCornerAt(x, y, ann.bbox)
      if (corner) {
        setResizing({ annotationId: ann.id, corner, originalBbox: { ...ann.bbox }, currentBbox: { ...ann.bbox } })
        return
      }
    }
    setDrag({ startX: x, startY: y, currentX: x, currentY: y, active: true })
  }

  const handleMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasCoords(ev)
    // Resize mode
    if (resizing) {
      const newBbox = applyResize(resizing.originalBbox, resizing.corner, x, y)
      setResizing((prev) => prev ? { ...prev, currentBbox: newBbox } : null)
      return
    }
    if (drag?.active) {
      setDrag((d) => d ? { ...d, currentX: x, currentY: y } : null)
      return
    }
    // Check corner hover for cursor
    let foundCorner: { annotationId: string; corner: ResizeCorner } | null = null
    for (const ann of pageAnnotations) {
      const corner = getCornerAt(x, y, ann.bbox)
      if (corner) {
        foundCorner = { annotationId: ann.id, corner }
        break
      }
    }
    setHoveredCorner(foundCorner)
    if (foundCorner) {
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = CORNER_CURSOR[foundCorner.corner]
      return
    } else {
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = 'crosshair'
    }
    // Hover: check table cells first, then annotations, then overlays
    // 1. Check individual table cells
    let foundTableCell = false
    for (const ann of pageAnnotations) {
      const labelDef = workspace?.labels.find((l) => l.name === ann.label)
      if (labelDef?.label_type === 'table' && ann.value_string) {
        const cells = getTableCells(ann)
        const hitCell = cells.find(
          (c) => x >= c.bbox.x_min && x <= c.bbox.x_max && y >= c.bbox.y_min && y <= c.bbox.y_max
        )
        if (hitCell) {
          setHoveredTableCell({ text: hitCell.text, label: ann.label, annId: ann.id })
          setHoveredAnnotation(null)
          setHoveredOverlay(null)
          setTooltipPos({ x: ev.clientX, y: ev.clientY })
          foundTableCell = true
          break
        }
      }
    }
    if (foundTableCell) return

    setHoveredTableCell(null)

    // 2. Check table bbox (for tables without cell-level bboxes)
    const hitTableAnn = pageAnnotations.find((a) => {
      const ld = workspace?.labels.find((l) => l.name === a.label)
      return ld?.label_type === 'table' && a.value_string
        && x >= a.bbox.x_min && x <= a.bbox.x_max && y >= a.bbox.y_min && y <= a.bbox.y_max
    })
    if (hitTableAnn) {
      setHoveredAnnotation(hitTableAnn)
      setHoveredOverlay(null)
      setTooltipPos({ x: ev.clientX, y: ev.clientY })
      return
    }

    // 3. Check regular annotations with OCR text
    const hit = pageAnnotations.find(
      (a) => a.value_string && x >= a.bbox.x_min && x <= a.bbox.x_max && y >= a.bbox.y_min && y <= a.bbox.y_max
    )
    if (hit) {
      setHoveredAnnotation(hit)
      setHoveredOverlay(null)
      setTooltipPos({ x: ev.clientX, y: ev.clientY })
    } else {
      setHoveredAnnotation(null)
      // 4. Check OCR overlays
      const hitOv = currentOcrOverlays.find(
        (ov) => x >= ov.bbox.x_min && x <= ov.bbox.x_max && y >= ov.bbox.y_min && y <= ov.bbox.y_max
      )
      if (hitOv) {
        setHoveredOverlay(hitOv)
        setTooltipPos({ x: ev.clientX, y: ev.clientY })
      } else {
        setHoveredOverlay(null)
        setTooltipPos(null)
      }
    }
  }

  const handleMouseUp = () => {
    // Finish resize
    if (resizing) {
      const { annotationId, currentBbox, originalBbox } = resizing
      setResizing(null)
      setHoveredCorner(null)
      // Only save if bbox actually changed
      if (
        currentBbox.x_min !== originalBbox.x_min ||
        currentBbox.y_min !== originalBbox.y_min ||
        currentBbox.x_max !== originalBbox.x_max ||
        currentBbox.y_max !== originalBbox.y_max
      ) {
        updateAnnotation.mutate({ annotationId, body: { bbox: currentBbox } })
      }
      return
    }
    if (!drag?.active) { setDrag(null); return }
    const bbox: BoundingBox = {
      x_min: Math.round(Math.min(drag.startX, drag.currentX)),
      y_min: Math.round(Math.min(drag.startY, drag.currentY)),
      x_max: Math.round(Math.max(drag.startX, drag.currentX)),
      y_max: Math.round(Math.max(drag.startY, drag.currentY)),
    }
    // Click (no drag) — check table annotations first, then overlays
    if (bbox.x_max - bbox.x_min < 5 || bbox.y_max - bbox.y_min < 5) {
      const clickX = Math.min(drag.startX, drag.currentX)
      const clickY = Math.min(drag.startY, drag.currentY)

      // Check if clicked on a table annotation → open editor
      if (!tablePickMode) {
        const hitTableAnn = pageAnnotations.find((a) => {
          const ld = workspace?.labels.find((l) => l.name === a.label)
          return ld?.label_type === 'table'
            && clickX >= a.bbox.x_min && clickX <= a.bbox.x_max
            && clickY >= a.bbox.y_min && clickY <= a.bbox.y_max
        })
        if (hitTableAnn) {
          setEditingTableAnnotation({
            annotationId: hitTableAnn.id,
            labelName: hitTableAnn.label,
            bbox: hitTableAnn.bbox,
            value_string: hitTableAnn.value_string,
          })
          setDrag(null)
          return
        }
      }

      const hitOverlay = currentOcrOverlays.find(
        (ov) => clickX >= ov.bbox.x_min && clickX <= ov.bbox.x_max
          && clickY >= ov.bbox.y_min && clickY <= ov.bbox.y_max,
      )
      if (hitOverlay) {
        // If table pick mode is active, send text to the table modal instead
        if (tablePickMode) {
          // Clear first to ensure useEffect fires even for same text
          setTablePickedText(null)
          requestAnimationFrame(() => setTablePickedText(hitOverlay.text))
          setDrag(null)
          return
        }
        setSelectedOverlay(hitOverlay)
        setPendingBbox(hitOverlay.bbox)
      }
      setDrag(null)
      return
    }
    setPendingBbox(bbox)
    setDrag(null)
  }

  const handleLabelSelect = async (labelName: string, overrideLabelType?: string) => {
    if (!pendingBbox) return
    const effectiveLabelType = overrideLabelType ?? workspace?.labels.find((l) => l.name === labelName)?.label_type
    if (effectiveLabelType === 'table') {
      const bbox = pendingBbox
      // Si hay overlay, usar su texto parseado; si no, pedir al backend que ensamble desde OCR guardado
      let initialData: { columns: string[]; rows: CellData[][] | string[][] } | undefined
      if (selectedOverlay) {
        initialData = parseTextToTable(selectedOverlay.text)
      } else if (workspaceId && decodedBlob) {
        try {
          initialData = await workspacesApi.assembleTable(workspaceId, decodedBlob, currentPage, bbox)
        } catch {
          // Si falla (no hay OCR guardado, etc.), abrir modal vacio
        }
      }
      setPendingTableLabel({ labelName, bbox, initialData })
      setPendingBbox(null)
      setLabelSearch('')
      setLabelColor('#2563eb')
      setLabelType('text')
      setSelectedOverlay(null)
      return
    }
    createAnnotation.mutate({
      page_number: currentPage,
      label: labelName,
      bbox: pendingBbox,
      value_string: selectedOverlay?.text ?? '',
      confidence: selectedOverlay?.confidence,
      source: selectedOverlay ? 'ocr' : undefined,
    })
    if (selectedOverlay) removeOverlay(selectedOverlay.id)
    setPendingBbox(null)
    setSelectedOverlay(null)
    setLabelSearch('')
    setLabelColor('#2563eb')
    setLabelType('text')
  }

  const handleTableSave = (annotation: TableAnnotation) => {
    setPendingTableLabel(null)
    createAnnotation.mutate({ page_number: annotation.page_number, label: annotation.label, bbox: annotation.bbox, value_string: annotation.value_string })
    if (selectedOverlay) {
      removeOverlay(selectedOverlay.id)
      setSelectedOverlay(null)
    }
    setToast({ message: 'Tabla guardada', type: 'success' })
  }

  const handleTableEdit = (annotation: TableAnnotation) => {
    if (!editingTableAnnotation) return
    updateAnnotation.mutate({ annotationId: editingTableAnnotation.annotationId, body: { value_string: annotation.value_string } })
    setEditingTableAnnotation(null)
  }

  const handleScan = async () => {
    if (!workspaceId || !decodedBlob || !docMeta) return
    setScanLoading(true)
    try {
      const result = await workspacesApi.scan(workspaceId, decodedBlob, currentPage)
      const pageResult = result.results[0]
      if (!pageResult || pageResult.lines.length === 0) {
        setToast({ message: 'No se detecto texto en esta pagina', type: 'error' })
        return
      }

      const overlays = scanLinesToOverlays(pageResult.lines)
        .filter((ov) => !overlapsAnnotation(ov, pageAnnotations))

      setOcrOverlaysMap((prev) => {
        const next = new Map(prev)
        next.set(currentPage, overlays)
        return next
      })
      setToast({ message: `${overlays.length} regiones detectadas`, type: 'success' })
    } catch {
      setToast({ message: 'Error al escanear. Verifica que el servicio OCR este activo.', type: 'error' })
    } finally {
      setScanLoading(false)
    }
  }

  const handleScanAll = async () => {
    if (!workspaceId || !decodedBlob || !docMeta || totalPages === 0) return
    setScanLoading(true)
    setScanAllProgress({ current: 0, total: totalPages })
    try {
      const result = await workspacesApi.scanAll(workspaceId, decodedBlob)
      let totalDetected = 0
      const newMap = new Map(ocrOverlaysMap)
      for (const pageResult of result.results) {
        const pageAnns = (annotations ?? []).filter((a) => a.page_number === pageResult.page_number)
        const overlays = scanLinesToOverlays(pageResult.lines)
          .filter((ov) => !overlapsAnnotation(ov, pageAnns))
        totalDetected += overlays.length
        newMap.set(pageResult.page_number, overlays)
      }
      setOcrOverlaysMap(newMap)
      setToast({
        message: `${totalDetected} regiones detectadas en ${result.total_pages_scanned} paginas`,
        type: 'success',
      })
    } catch {
      setToast({ message: 'Error al escanear. Verifica que el servicio OCR este activo.', type: 'error' })
    } finally {
      setScanLoading(false)
      setScanAllProgress(null)
    }
  }

  // Cargar OCR guardado al cambiar de pagina
  useEffect(() => {
    if (!workspaceId || !decodedBlob || totalPages === 0) return
    if (ocrOverlaysMap.has(currentPage)) return // ya cargado
    workspacesApi.getOcrResults(workspaceId, decodedBlob, currentPage).then((result) => {
      const pageResult = result.results[0]
      if (!pageResult || pageResult.lines.length === 0) return
      const overlays = scanLinesToOverlays(pageResult.lines)
        .filter((ov) => !overlapsAnnotation(ov, pageAnnotations))
      if (overlays.length > 0) {
        setOcrOverlaysMap((prev) => {
          const next = new Map(prev)
          next.set(currentPage, overlays)
          return next
        })
      }
    }).catch(() => { /* no saved OCR for this page */ })
  }, [workspaceId, decodedBlob, currentPage, totalPages])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  const hasDocument = !!docMeta

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={3000}
          onClose={() => setToast(null)}
        />
      )}

      {/* Panel canvas */}
      <div className="flex flex-col flex-1 overflow-hidden border-r border-slate-200">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 h-16 bg-white border-b border-slate-200 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/workspaces/${workspaceId}`)}>
            <BackIcon />
            Documentos
          </Button>
          <span className="text-slate-300 select-none">|</span>
          <span className="text-sm font-mono text-slate-600 flex-1 truncate" title={decodedBlob}>
            {decodedBlob}
          </span>
          <button
            onClick={handleScan}
            disabled={scanLoading || !hasDocument}
            title="Escanear pagina actual con Surya OCR"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanLoading && !scanAllProgress ? <Spinner size="sm" /> : <ScanIcon />}
            {scanLoading && !scanAllProgress ? 'Escaneando...' : 'Escanear pagina'}
          </button>
          <button
            onClick={handleScanAll}
            disabled={scanLoading || !hasDocument}
            title="Escanear todas las paginas del documento con Surya OCR"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanAllProgress ? (
              <>
                <Spinner size="sm" />
                <span>Escaneando {totalPages} pags...</span>
              </>
            ) : (
              <>
                <ScanIcon />
                <span>Escanear todo ({totalPages})</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowAutoLabel(true)}
            disabled={scanLoading || !hasDocument || autoLabelMutation.isPending}
            title="Auto-etiquetar usando un documento de referencia ya etiquetado"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {autoLabelMutation.isPending ? <Spinner size="sm" /> : <ScanIcon />}
            {autoLabelMutation.isPending ? 'Auto-etiquetando...' : 'Auto-etiquetar'}
          </button>
          {hasAutoLabelAnnotations && (
            <button
              onClick={() => clearAutoLabelMutation.mutate()}
              disabled={clearAutoLabelMutation.isPending}
              title="Eliminar todas las anotaciones generadas por auto-etiquetado"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {clearAutoLabelMutation.isPending ? <Spinner size="sm" /> : <TrashIcon />}
              {clearAutoLabelMutation.isPending ? 'Eliminando...' : 'Eliminar auto-etiquetado'}
            </button>
          )}
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto flex flex-col items-center p-4">
          {!hasDocument ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Spinner size="lg" />
              <p className="text-sm font-medium text-slate-500">Cargando documento...</p>
            </div>
          ) : imageLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Spinner size="lg" />
              <p className="text-sm font-medium text-slate-500">Renderizando página {currentPage}...</p>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className="max-w-full shadow-lg rounded cursor-crosshair"
                style={{ display: 'block' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setHoveredAnnotation(null); setTooltipPos(null) }}
              />

              {/* Navegación de páginas debajo del canvas */}
              {totalPages > 1 && (
                <div className="flex items-center gap-3 mt-4 py-3 px-6 bg-white rounded-xl shadow-sm border border-slate-200">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => goToPage(currentPage - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                    Anterior
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Página</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (!isNaN(val) && val >= 1 && val <= totalPages) goToPage(val)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                      className="text-sm font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg w-14 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-slate-500">de {totalPages}</span>
                  </div>

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  >
                    Siguiente
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Popup label selector cuando hay pendingBbox */}
        {pendingBbox && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Selecciona o crea una etiqueta</h3>

              {/* Texto OCR editable (solo si viene de un overlay) */}
              {selectedOverlay && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-amber-700 font-semibold">Texto detectado (editable):</label>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOverlay((prev) => prev ? { ...prev, isTable: !prev.isTable } : null)
                        // También actualizar en el mapa de overlays
                        setOcrOverlaysMap((prev) => {
                          const next = new Map(prev)
                          const page = next.get(currentPage)
                          if (page) {
                            next.set(currentPage, page.map((o) => o.id === selectedOverlay.id ? { ...o, isTable: !o.isTable } : o))
                          }
                          return next
                        })
                      }}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors ${
                        selectedOverlay.isTable
                          ? 'bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200'
                          : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {selectedOverlay.isTable ? '▦ Tabla → Cambiar a Texto' : '¶ Texto → Cambiar a Tabla'}
                    </button>
                  </div>
                  <textarea
                    value={selectedOverlay.text}
                    onChange={(e) => setSelectedOverlay((prev) => prev ? { ...prev, text: e.target.value } : null)}
                    rows={2}
                    className="w-full mt-1 px-3 py-2 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 font-mono bg-white"
                  />
                  <p className="text-xs text-amber-600 mt-1">Confianza: {Math.round(selectedOverlay.confidence * 100)}%</p>
                </div>
              )}

              {/* Búsqueda y creación */}
              <div className="space-y-2 mb-4">
                <input
                  type="text"
                  placeholder="Buscar o crear etiqueta..."
                  value={labelSearch}
                  onChange={(e) => setLabelSearch(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />

                {labelSearch && !workspace?.labels.find((l) => l.name.toLowerCase() === labelSearch.toLowerCase()) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <select
                        value={labelType}
                        onChange={(e) => setLabelType(e.target.value as 'text' | 'table' | 'signature')}
                        className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
                      >
                        <option value="text">Texto</option>
                        <option value="table">Tabla</option>
                        <option value="signature">Firma</option>
                      </select>
                      <input
                        type="color"
                        value={labelColor}
                        onChange={(e) => setLabelColor(e.target.value)}
                        className="w-10 h-9 border border-slate-300 rounded-lg cursor-pointer"
                        title="Color de la etiqueta"
                      />
                    </div>
                    <button
                      onClick={() => {
                        addLabel.mutate(
                          { name: labelSearch, color: labelColor, description: '', label_type: labelType },
                          {
                            onSuccess: () => {
                              handleLabelSelect(labelSearch, labelType)
                              setLabelSearch('')
                              setLabelColor('#2563eb')
                              setLabelType('text')
                            },
                          }
                        )
                      }}
                      disabled={addLabel.isPending}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {addLabel.isPending ? 'Creando...' : `Crear etiqueta (${labelType === 'table' ? 'tabla' : labelType === 'signature' ? 'firma' : 'texto'})`}
                    </button>
                  </div>
                )}
              </div>

              {/* Lista de etiquetas (filtradas) */}
              {workspace && workspace.labels.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-slate-500 font-semibold mb-2">Etiquetas disponibles:</p>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {workspace.labels
                      .filter((l) => !labelSearch || l.name.toLowerCase().includes(labelSearch.toLowerCase()))
                      .map((l) => (
                        <button
                          key={l.name}
                          onClick={() => {
                            handleLabelSelect(l.name)
                            setLabelSearch('')
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all hover:opacity-80 flex items-center gap-1"
                          style={{
                            borderColor: l.color,
                            color: '#fff',
                            backgroundColor: l.color,
                          }}
                        >
                          {l.name}
                          {l.label_type === 'table' && <span className="opacity-80 text-[10px]">▦</span>}
                          {l.label_type === 'signature' && <span className="opacity-80 text-[10px]">✍</span>}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setPendingBbox(null)
                  setSelectedOverlay(null)
                  setLabelSearch('')
                  setLabelColor('#2563eb')
                  setLabelType('text')
                }}
                className="w-full px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tooltip para celda de tabla */}
        {hoveredTableCell && tooltipPos && (
          <div
            className="fixed z-50 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
          >
            <p className="font-mono text-white text-sm">{hoveredTableCell.text}</p>
            <p className="text-slate-400 mt-0.5">{hoveredTableCell.label} (click para editar tabla)</p>
          </div>
        )}

        {/* Tooltip flotante OCR — hover sobre anotacion con texto */}
        {hoveredAnnotation && !hoveredTableCell && tooltipPos && (
          <div
            className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none max-w-xs"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
          >
            <p className="font-bold text-emerald-400">{hoveredAnnotation.label}</p>
            <p className="mt-1 font-mono text-white break-words">{hoveredAnnotation.value_string}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-gray-400">Confianza:</span>
              <span className="font-semibold text-emerald-300">
                {Math.round((hoveredAnnotation.confidence ?? 0) * 100)}%
              </span>
              {hoveredAnnotation.text_type && hoveredAnnotation.text_type !== 'unknown' && (
                <span className="text-gray-400 capitalize">{hoveredAnnotation.text_type}</span>
              )}
            </div>
          </div>
        )}

        {/* Tooltip para OCR overlays */}
        {hoveredOverlay && !hoveredAnnotation && tooltipPos && (
          <div
            className="fixed z-50 bg-amber-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none max-w-xs"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
          >
            <p className="font-bold text-amber-300">Texto detectado (click para asignar label)</p>
            <p className="mt-1 font-mono text-white break-words">{hoveredOverlay.text}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-amber-400">Confianza:</span>
              <span className="font-semibold text-amber-200">{Math.round(hoveredOverlay.confidence * 100)}%</span>
              {hoveredOverlay.isTable && <span className="text-violet-300">Tabla</span>}
            </div>
          </div>
        )}

        {/* Table editor modal — crear nueva */}
        {pendingTableLabel && (
          <TableEditorModal
            labelName={pendingTableLabel.labelName}
            bbox={pendingTableLabel.bbox}
            pageNumber={currentPage}
            initialData={pendingTableLabel.initialData}
            pickedText={tablePickedText}
            onPickModeChange={(active) => { setTablePickMode(active); if (!active) setTablePickedText(null) }}
            onSave={handleTableSave}
            onClose={() => {
              setPendingTableLabel(null)
              setSelectedOverlay(null)
              setTablePickMode(false)
              setTablePickedText(null)
            }}
          />
        )}

        {/* Table editor modal — editar existente */}
        {editingTableAnnotation && (() => {
          let initialData: { columns: string[]; rows: string[][] } | undefined
          try { initialData = JSON.parse(editingTableAnnotation.value_string) } catch { /* ignore */ }
          return (
            <TableEditorModal
              labelName={editingTableAnnotation.labelName}
              bbox={editingTableAnnotation.bbox}
              pageNumber={currentPage}
              initialData={initialData}
              pickedText={tablePickedText}
              onPickModeChange={(active) => { setTablePickMode(active); if (!active) setTablePickedText(null) }}
              onSave={handleTableEdit}
              onClose={() => { setEditingTableAnnotation(null); setTablePickMode(false); setTablePickedText(null) }}
            />
          )
        })()}

      </div>

      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 bg-white flex flex-col overflow-y-auto">

        {/* Etiquetas del workspace (colapsable) */}
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setLabelsCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Etiquetas
              {workspace && workspace.labels.length > 0 && (
                <span className="ml-1.5 bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 text-xs font-semibold">
                  {workspace.labels.length}
                </span>
              )}
            </p>
            <svg
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${labelsCollapsed ? '' : 'rotate-180'}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {!labelsCollapsed && (
            <div className="px-4 pb-3 max-h-40 overflow-y-auto">
              {!workspace || workspace.labels.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin etiquetas definidas en el workspace.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {workspace.labels.map((l) => (
                    renamingLabel?.name === l.name ? (
                      <form
                        key={l.name}
                        className="inline-flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const trimmed = renamingLabel.newName.trim()
                          if (trimmed && trimmed !== l.name) {
                            renameLabelMutation.mutate({ oldName: l.name, newName: trimmed })
                          } else {
                            setRenamingLabel(null)
                          }
                        }}
                      >
                        <input
                          autoFocus
                          value={renamingLabel.newName}
                          onChange={(e) => setRenamingLabel({ ...renamingLabel, newName: e.target.value })}
                          onBlur={() => setRenamingLabel(null)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setRenamingLabel(null) }}
                          className="px-2 py-0.5 text-xs font-semibold border-2 rounded-md w-28 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          style={{ borderColor: l.color, color: l.color }}
                        />
                      </form>
                    ) : (
                      <span
                        key={l.name}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold border-2 inline-flex items-center gap-1 group cursor-pointer"
                        style={{
                          borderColor: l.color,
                          color: l.color,
                        }}
                        onDoubleClick={() => setRenamingLabel({ name: l.name, newName: l.name })}
                        title="Doble click para renombrar"
                      >
                        {l.name}
                        <button
                          onClick={() => removeLabelMutation.mutate(l.name)}
                          title={`Eliminar "${l.name}"`}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all ml-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Anotaciones */}
        <div className="p-4 border-b border-slate-100 flex-1 overflow-y-auto">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Anotaciones
            {pageAnnotations.length > 0 && (
              <span className="ml-1.5 bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 text-xs font-semibold">
                {pageAnnotations.length}
              </span>
            )}
          </p>
          {pageAnnotations.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin anotaciones en esta página.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pageAnnotations.map((ann) => {
                const labelDef = workspace?.labels.find((l) => l.name === ann.label)
                const isTable = labelDef?.label_type === 'table'
                let tablePreview: string | null = null
                if (isTable && ann.value_string) {
                  try {
                    const parsed = JSON.parse(ann.value_string)
                    tablePreview = `${parsed.columns?.length ?? 0} col × ${parsed.rows?.length ?? 0} filas`
                  } catch { /* not valid JSON */ }
                }
                return (
                  <li
                    key={ann.id}
                    className={`flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group ${isTable && tablePreview ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                    onClick={isTable && tablePreview ? () => setEditingTableAnnotation({ annotationId: ann.id, labelName: ann.label, bbox: ann.bbox, value_string: ann.value_string }) : undefined}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: labelDef?.color ?? '#2563eb' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 leading-none flex items-center gap-1">
                        {ann.label}
                        {isTable && <span className="text-[10px] opacity-60">▦</span>}
                        {ann.source === 'ocr' && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-semibold">
                            {Math.round((ann.confidence ?? 0) * 100)}%
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {tablePreview ?? ann.value_string ?? '—'}
                      </p>
                    </div>
                    {isTable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTableAnnotation({ annotationId: ann.id, labelName: ann.label, bbox: ann.bbox, value_string: ann.value_string }) }}
                        title="Editar tabla"
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded p-0.5 transition-all flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann) }}
                      title="Eliminar"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-all flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

      </aside>

      {/* Auto-label reference selector modal */}
      {showAutoLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <h3 className="font-bold text-sm mb-3">Auto-etiquetar desde referencia</h3>
            <p className="text-xs text-slate-500 mb-3">
              Elige un documento ya etiquetado (DONE) para usar como plantilla.
              Las paginas del documento destino deben estar escaneadas (OCR).
            </p>
            <select
              value={selectedReference ?? ''}
              onChange={(e) => setSelectedReference(e.target.value || null)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">— Seleccionar documento —</option>
              {workspace?.documents
                .filter((d) => d.status === 'DONE' && d.blob_name !== decodedBlob)
                .map((d) => (
                  <option key={d.blob_name} value={d.blob_name}>{d.blob_name}</option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowAutoLabel(false); setSelectedReference(null) }}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!selectedReference || autoLabelMutation.isPending}
                onClick={() => selectedReference && autoLabelMutation.mutate({ refBlob: selectedReference })}
              >
                {autoLabelMutation.isPending ? 'Procesando...' : 'Auto-etiquetar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
