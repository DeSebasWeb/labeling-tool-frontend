import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { workspacesApi } from '../api/workspaces'
import type { CreateWorkspaceRequest, DocumentKind } from '../types/api'
import { AppShell } from '../components/layout/AppShell'
import { Topbar } from '../components/layout/Topbar'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { ProgressBar } from '../components/ui/ProgressBar'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'

const KIND_OPTIONS = [
  { value: 'E14_SENADO', label: 'E14 Senado' },
  { value: 'E14_CAMARA', label: 'E14 Cámara' },
]

const FolderIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25" />
  </svg>
)

const DocIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
)

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
)

export default function WorkspacesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateWorkspaceRequest>({
    name: '',
    document_kind: 'E14_SENADO',
    model_name: '',
  })

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setShowForm(false)
      setForm({ name: '', document_kind: 'E14_SENADO', model_name: '' })
    },
  })

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!form.name.trim() || !form.model_name.trim()) return
    createMutation.mutate(form)
  }

  const totalDocs = workspaces.reduce((s, w) => s + w.total_documents, 0)
  const totalDone = workspaces.reduce((s, w) => s + w.total_done, 0)

  return (
    <AppShell
      header={
        <Topbar
          left={
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 leading-none">Labeling Tool</h1>
                <p className="text-xs text-slate-500 leading-none mt-0.5">E14 — Genesis Siglo XXI</p>
              </div>
            </div>
          }
          right={
            <Button onClick={() => setShowForm((v) => !v)} size="sm" variant={showForm ? 'ghost' : 'primary'}>
              {showForm ? 'Cancelar' : <><PlusIcon /> Nuevo workspace</>}
            </Button>
          }
        />
      }
    >
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Stats */}
        {workspaces.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Workspaces', value: workspaces.length, icon: '🗂️' },
              { label: 'Documentos totales', value: totalDocs, icon: '📄' },
              { label: 'Completados', value: totalDone, icon: '✅' },
            ].map((s) => (
              <Card key={s.label} className="text-center py-4">
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Formulario de creación */}
        {showForm && (
          <Card>
            <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">Nuevo workspace</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="ws-name"
                  label="Nombre"
                  placeholder="Ej: Senado 2024-S1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  minLength={3}
                />
                <Input
                  id="ws-model"
                  label="Modelo"
                  placeholder="Ej: E14-senado-V1"
                  value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                  required
                />
              </div>
              <Select
                id="ws-kind"
                label="Tipo de documento"
                value={form.document_kind}
                onChange={(e) => setForm({ ...form, document_kind: e.target.value as DocumentKind })}
                options={KIND_OPTIONS}
              />
              {createMutation.isError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {(createMutation.error as any)?.response?.data?.detail ?? 'Error al crear el workspace'}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={createMutation.isPending}>Crear workspace</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Lista */}
        {isLoading ? (
          <PageSpinner />
        ) : workspaces.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderIcon />}
              title="No hay workspaces"
              description="Crea tu primer workspace para empezar a etiquetar documentos."
              action={<Button onClick={() => setShowForm(true)}><PlusIcon />Crear workspace</Button>}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">
              Workspaces ({workspaces.length})
            </h2>
            {workspaces.map((ws) => {
              const pct = ws.total_documents > 0
                ? Math.round((ws.total_done / ws.total_documents) * 100) : 0
              const isDone = ws.total_documents > 0 && ws.total_done === ws.total_documents
              return (
                <button
                  key={ws.id}
                  onClick={() => navigate(`/workspaces/${ws.id}`)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 hover:shadow-md transition-all duration-150 group"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <DocIcon />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 transition-colors">{ws.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="info">{ws.document_kind.replace('_', ' ')}</Badge>
                          <span className="text-xs text-slate-400 font-mono">{ws.model_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-semibold text-slate-700">{ws.total_done}/{ws.total_documents}</p>
                        <p className="text-xs text-slate-400">documentos</p>
                      </div>
                      <Badge variant={isDone ? 'done' : pct > 0 ? 'inProgress' : 'pending'}>
                        {isDone ? 'Completo' : pct > 0 ? `${pct}%` : 'Pendiente'}
                      </Badge>
                      <ChevronRightIcon />
                    </div>
                  </div>
                  {ws.total_documents > 0 && (
                    <div className="mt-3">
                      <ProgressBar value={pct} colorClass={isDone ? 'bg-green-500' : 'bg-blue-500'} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
