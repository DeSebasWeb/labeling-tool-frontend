import client from './client'
import type { Annotation, CreateAnnotationRequest, UpdateAnnotationRequest } from '../types/api'

export const annotationsApi = {
  listByDocument: (documentId: string): Promise<Annotation[]> =>
    client.get<Annotation[]>(`/documents/${documentId}/annotations`).then((r) => r.data),

  create: (body: CreateAnnotationRequest): Promise<Annotation> =>
    client.post<Annotation>('/annotations', body).then((r) => r.data),

  update: (id: string, body: UpdateAnnotationRequest): Promise<Annotation> =>
    client.patch<Annotation>(`/annotations/${id}`, body).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    client.delete(`/annotations/${id}`).then(() => undefined),
}
