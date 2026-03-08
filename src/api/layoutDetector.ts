import client from './client'
import type { LayoutDetectResponse } from '../types/api'

export const layoutDetectorApi = {
  /**
   * Detecta el layout de una página enviando la solicitud al backend del
   * labeling-tool, que actúa como proxy hacia el servidor GPU interno.
   * El browser nunca contacta directamente al layout-detector.
   *
   * @param workspaceId  ID del workspace
   * @param blobName     Nombre del blob (sin encoding — se encodea aquí)
   * @param pageNumber   Número de la página a analizar
   */
  detectLayout: (
    workspaceId: string,
    blobName: string,
    pageNumber: number,
  ): Promise<LayoutDetectResponse> =>
    client
      .post<LayoutDetectResponse>(
        `/workspaces/${workspaceId}/documents/${encodeURIComponent(blobName)}/detect-layout`,
        { page_number: pageNumber },
      )
      .then((r) => r.data),
}
