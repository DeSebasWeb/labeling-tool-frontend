import { useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { workspacesApi } from '../api/workspaces'
import type { DocumentStatus } from '../types/api'
import { AppShell } from '../components/layout/AppShell'
import { Topbar } from '../components/layout/Topbar'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'

const STATUS_BADGE: Record<DocumentStatus, { label: string; variant: 'pending' | 'inProgress' | 'done' }> = {
  PENDING:     { label: 'Pendiente',   variant: 'pending' },
  IN_PROGRESS: { label: 'En progreso', variant: 'inProgress' },
  DONE:        { label: 'Listo',       variant: 'done' },
}

const BackIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
)

const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
)

const FileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
)

const TagIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
  </svg>
)

export default function DocumentsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => workspacesApi.uploadDocument(workspaceId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (blobName: string) => workspacesApi.deleteDocument(workspaceId!, blobName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  })

  const handleFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    ev.target.value = ''
  }

  const handleDragOver = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    if (ev.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((ev: React.DragEvent) => {
    // solo cuando el cursor sale del contenedor raíz
    if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    setIsDragOver(false)
    const file = ev.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') uploadMutation.mutate(file)
  }, [uploadMutation])

  if (isLoading) return <PageSpinner />
  if (error || !workspace) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-slate-500">Workspace no encontrado.</p>
    </div>
  )

  const pctDone = workspace.total_documents > 0
    ? Math.round((workspace.total_done / workspace.total_documents) * 100) : 0

  return (
    <AppShell
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      header={
        <Topbar
          left={
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <BackIcon />
                Workspaces
              </Button>
              <span className="text-slate-300 select-none">|</span>
              <div>
                <h1 className="text-sm font-bold text-slate-900 leading-none">{workspace.name}</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="info">{workspace.document_kind.replace('_', ' ')}</Badge>
                  <span className="text-xs text-slate-400 font-mono">{workspace.model_name}</span>
                </div>
              </div>
            </div>
          }
          right={
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={uploadMutation.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon />
                {uploadMutation.isPending ? 'Subiendo...' : 'Subir PDF'}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </>
          }
        />
      }
    >
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-4 border-dashed border-blue-400 rounded-xl m-4 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <UploadIcon />
          </div>
          <p className="text-lg font-bold text-blue-700">Suelta el PDF aquí</p>
          <p className="text-sm text-blue-500">Se subirá automáticamente al workspace</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Progreso global */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Progreso del workspace</p>
            <span className="text-sm font-bold text-slate-900">{workspace.total_done}/{workspace.total_documents}</span>
          </div>
          <ProgressBar
            value={pctDone}
            label={`${workspace.total_done} documentos completados`}
            colorClass={pctDone === 100 ? 'bg-green-500' : 'bg-blue-500'}
          />
        </Card>

        {uploadMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {(uploadMutation.error as any)?.response?.data?.detail ?? 'Error al subir el archivo'}
          </div>
        )}

        {/* Documentos */}
        {workspace.documents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileIcon />}
              title="No hay documentos"
              description="Sube un PDF para empezar a etiquetar."
              action={
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <UploadIcon />
                  Subir PDF
                </Button>
              }
            />
          </Card>
        ) : (
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Documentos ({workspace.documents.length})
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {workspace.documents.map((doc) => {
                const status = STATUS_BADGE[doc.status]
                return (
                  <div key={doc.blob_name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                    <div className="flex-shrink-0 text-slate-300 group-hover:text-slate-400 transition-colors">
                      <FileIcon />
                    </div>
                    <span className="flex-1 text-sm text-slate-700 font-mono truncate" title={doc.blob_name}>
                      {doc.blob_name}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <Button
                      size="sm"
                      variant={doc.status === 'DONE' ? 'secondary' : 'primary'}
                      onClick={() => navigate(`/workspaces/${workspaceId}/editor/${encodeURIComponent(doc.blob_name)}`)}
                    >
                      <TagIcon />
                      {doc.status === 'DONE' ? 'Revisar' : 'Etiquetar'}
                    </Button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar "${doc.blob_name}" y todos sus datos?`))
                          deleteMutation.mutate(doc.blob_name)
                      }}
                      title="Eliminar documento"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-1.5 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
