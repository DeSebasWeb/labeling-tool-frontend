import client from './client'
import type { Workspace, CreateWorkspaceRequest, ExportLabelsResponse } from '../types/api'

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

  markDone: (workspaceId: string, blobName: string): Promise<Workspace> =>
    client
      .patch<Workspace>(`/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/done`)
      .then((r) => r.data),

  exportLabels: (
    workspaceId: string,
    blobName: string,
    documentId: string,
  ): Promise<ExportLabelsResponse> =>
    client
      .post<ExportLabelsResponse>(
        `/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/export`,
        null,
        { params: { document_id: documentId } },
      )
      .then((r) => r.data),
}
