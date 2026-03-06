import client from './client'
import type { Document, PageInfo } from '../types/api'

export const documentsApi = {
  list: (): Promise<Document[]> =>
    client.get<Document[]>('/documents').then((r) => r.data),

  get: (id: string): Promise<Document> =>
    client.get<Document>(`/documents/${id}`).then((r) => r.data),

  getPages: (id: string): Promise<PageInfo[]> =>
    client.get<PageInfo[]>(`/documents/${id}/pages`).then((r) => r.data),

  upload: (file: File): Promise<Document> => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post<Document>('/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  pageUrl: (documentId: string, pageNumber: number): string =>
    `/api/documents/${documentId}/pages/${pageNumber}/image`,
}
