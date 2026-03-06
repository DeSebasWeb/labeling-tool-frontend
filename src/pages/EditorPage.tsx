import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '../api/documents'
import { annotationsApi } from '../api/annotations'
import { workspacesApi } from '../api/workspaces'
import { schemasApi } from '../api/schemas'
import type { BoundingBox, LabelDefinition } from '../types/api'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}

const BackIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
)

const ExportIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
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
  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const [valueString, setValueString] = useState('')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // Cargar workspace para obtener document_kind
  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  })

  // Schema dinámico según document_kind del workspace
  const schemaId = workspace?.document_kind ?? null

  const { data: schema } = useQuery({
    queryKey: ['schema', schemaId],
    queryFn: () => schemasApi.get(schemaId!),
    enabled: !!schemaId,
  })

  const labels: LabelDefinition[] = schema?.labels ?? []

  useEffect(() => {
    if (labels.length > 0 && !selectedLabel) {
      setSelectedLabel(labels[0].name)
    }
  }, [labels, selectedLabel])

  // Buscar el documento local por original_filename
  const { data: allDocs } = useQuery({
    queryKey: ['documents'],
    queryFn: documentsApi.list,
  })

  useEffect(() => {
    if (!allDocs || !decodedBlob) return
    const existing = allDocs.find((d) => d.original_filename === decodedBlob)
    if (existing) setDocumentId(existing.id)
  }, [allDocs, decodedBlob])

  // Documento local (para page_count)
  const { data: document } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => documentsApi.get(documentId!),
    enabled: !!documentId,
  })

  // Páginas del documento (lista de metadatos, no imágenes)
  const { data: pages = [] } = useQuery({
    queryKey: ['document-pages', documentId],
    queryFn: () => documentsApi.getPages(documentId!),
    enabled: !!documentId,
  })

  // Anotaciones
  const { data: annotations = [] } = useQuery({
    queryKey: ['annotations', documentId],
    queryFn: () => annotationsApi.listByDocument(documentId!),
    enabled: !!documentId,
  })

  const createAnnotation = useMutation({
    mutationFn: annotationsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', documentId] }),
  })

  const deleteAnnotation = useMutation({
    mutationFn: annotationsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', documentId] }),
  })

  const exportMutation = useMutation({
    mutationFn: () => workspacesApi.exportLabels(workspaceId!, decodedBlob, documentId!),
    onSuccess: (data) => {
      setExportMsg(`Exportado: ${data.labels_blob}`)
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
    },
  })

  const totalPages = document?.page_count ?? pages.length
  const pageInfo = pages.find((p) => p.page_number === currentPage)
  const pageAnnotations = annotations.filter((a) => a.page_number === currentPage)

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
      const label = labels.find((l) => l.name === ann.label)
      const color = label?.color ?? '#2563eb'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(ann.bbox.x_min, ann.bbox.y_min, ann.bbox.x_max - ann.bbox.x_min, ann.bbox.y_max - ann.bbox.y_min)
      ctx.fillStyle = color + '33'
      ctx.fillRect(ann.bbox.x_min, ann.bbox.y_min, ann.bbox.x_max - ann.bbox.x_min, ann.bbox.y_max - ann.bbox.y_min)
      ctx.fillStyle = color
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(ann.label, ann.bbox.x_min + 2, ann.bbox.y_min - 3)
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
  }, [pageAnnotations, drag, labels])

  // Cargar imagen de la página actual (solo una a la vez)
  useEffect(() => {
    if (!documentId || !pageInfo) return
    setImageLoading(true)
    imgRef.current = null
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImageLoading(false)
      drawCanvas()
    }
    img.onerror = () => setImageLoading(false)
    img.src = `/api/documents/${documentId}/pages/${currentPage}/image`
  }, [documentId, currentPage, pageInfo]) // drawCanvas omitido intencionalmente para no recargar imagen

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
    setDrag({ startX: x, startY: y, currentX: x, currentY: y, active: true })
  }

  const handleMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag?.active) return
    const { x, y } = canvasCoords(ev)
    setDrag((d) => d ? { ...d, currentX: x, currentY: y } : null)
  }

  const handleMouseUp = () => {
    if (!drag?.active || !documentId || !selectedLabel) { setDrag(null); return }
    const bbox: BoundingBox = {
      x_min: Math.round(Math.min(drag.startX, drag.currentX)),
      y_min: Math.round(Math.min(drag.startY, drag.currentY)),
      x_max: Math.round(Math.max(drag.startX, drag.currentX)),
      y_max: Math.round(Math.max(drag.startY, drag.currentY)),
    }
    if (bbox.x_max - bbox.x_min < 5 || bbox.y_max - bbox.y_min < 5) { setDrag(null); return }
    createAnnotation.mutate({ document_id: documentId, page_number: currentPage, label: selectedLabel, bbox, value_string: valueString })
    setDrag(null)
    setValueString('')
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">

      {/* Panel canvas */}
      <div className="flex flex-col flex-1 overflow-hidden border-r border-slate-200">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-slate-200 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/workspaces/${workspaceId}`)}>
            <BackIcon />
            Documentos
          </Button>
          <span className="text-slate-300 select-none">|</span>
          <span className="text-xs font-mono text-slate-600 flex-1 truncate" title={decodedBlob}>
            {decodedBlob}
          </span>
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto flex flex-col items-center p-4">
          {!documentId ? (
            <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-8">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">PDF no registrado localmente</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Usa "Subir PDF" en la página de documentos para registrarlo antes de etiquetar.
              </p>
            </div>
          ) : imageLoading || !pageInfo ? (
            <div className="flex items-center justify-center h-full">
              <Spinner size="lg" />
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
                onMouseLeave={handleMouseUp}
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
                    <span className="text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg min-w-[40px] text-center">
                      {currentPage}
                    </span>
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
      </div>

      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 bg-white flex flex-col overflow-y-auto">

        {/* Etiqueta activa */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Etiqueta activa</p>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <button
                key={l.name}
                onClick={() => setSelectedLabel(l.name)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold border-2 transition-all duration-100"
                style={{
                  borderColor: l.color,
                  color: selectedLabel === l.name ? '#fff' : l.color,
                  background: selectedLabel === l.name ? l.color : 'transparent',
                }}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Texto de la región */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Texto de la región</p>
          <textarea
            rows={3}
            placeholder="Texto visible en la bbox..."
            value={valueString}
            onChange={(e) => setValueString(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400"
          />
          <p className="text-xs text-slate-400 mt-1.5">Dibuja la bbox en el canvas para guardar con este texto.</p>
        </div>

        {/* Anotaciones */}
        <div className="p-4 border-b border-slate-100 flex-1">
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
                const labelDef = labels.find((l) => l.name === ann.label)
                return (
                  <li key={ann.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: labelDef?.color ?? '#2563eb' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 leading-none">{ann.label}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{ann.value_string || '—'}</p>
                    </div>
                    <button
                      onClick={() => deleteAnnotation.mutate(ann.id)}
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

        {/* Exportar */}
        <div className="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Exportar</p>
          <Button
            variant="success"
            size="md"
            className="w-full"
            disabled={!documentId || annotations.length === 0}
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <ExportIcon />
            {exportMutation.isPending ? 'Exportando...' : 'Exportar al blob'}
          </Button>
          {exportMsg && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2 break-all">
              {exportMsg}
            </p>
          )}
          {exportMutation.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
              {(exportMutation.error as any)?.response?.data?.detail ?? 'Error al exportar'}
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
