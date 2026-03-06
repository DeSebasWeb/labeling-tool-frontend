import client from './client'
import type {
  Workspace,
  CreateWorkspaceRequest,
  DocumentMeta,
  Annotation,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  ExportLabelsResponse,
} from '../types/api'

export const workspacesApi = {
  list: (): Promise<Workspace[]> =>
    client.get<Workspace[]>('/workspaces').then((r) => r.data),

  get: (id: string): Promise<Workspace> =>
    client.get<Workspace>(`/workspaces/${id}`).then((r) => r.data),

  create: (body: CreateWorkspaceRequest): Promise<Workspace> =>
    client.post<Workspace>('/workspaces', body).then((r) => r.data),

  uploadDocument: (workspaceId: string, file: File): Promise<Workspace> => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post<Workspace>(`/workspaces/${workspaceId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  deleteDocument: (workspaceId: string, blobName: string): Promise<Workspace> =>
    client
      .delete<Workspace>(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}`)
      .then((r) => r.data),

  // ── Document metadata from blob ──────────────────────────────────────────

  getDocumentMeta: (workspaceId: string, blobName: string): Promise<DocumentMeta> =>
    client
      .get<DocumentMeta>(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/meta`)
      .then((r) => r.data),

  pageImageUrl: (workspaceId: string, blobName: string, pageNumber: number): string =>
    `/api/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/pages/${pageNumber}/image`,

  // ── Annotations (workspace-scoped, blob-backed) ──────────────────────────

  listAnnotations: (workspaceId: string, blobName: string): Promise<Annotation[]> =>
    client
      .get<Annotation[]>(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/annotations`)
      .then((r) => r.data),

  createAnnotation: (workspaceId: string, blobName: string, body: CreateAnnotationRequest): Promise<Annotation> =>
    client
      .post<Annotation>(
        `/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/annotations`,
        body,
      )
      .then((r) => r.data),

  updateAnnotation: (
    workspaceId: string,
    blobName: string,
    annotationId: string,
    body: UpdateAnnotationRequest,
  ): Promise<Annotation> =>
    client
      .patch<Annotation>(
        `/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/annotations/${annotationId}`,
        body,
      )
      .then((r) => r.data),

  deleteAnnotation: (workspaceId: string, blobName: string, annotationId: string): Promise<void> =>
    client
      .delete(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/annotations/${annotationId}`)
      .then(() => undefined),

  // ── Workflow ──────────────────────────────────────────────────────────────

  markDone: (workspaceId: string, blobName: string): Promise<Workspace> =>
    client
      .patch<Workspace>(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/done`)
      .then((r) => r.data),

  exportLabels: (workspaceId: string, blobName: string): Promise<ExportLabelsResponse> =>
    client
      .post<ExportLabelsResponse>(
        `/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/export`,
      )
      .then((r) => r.data),
}
