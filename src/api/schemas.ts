import client from './client'
import type { LabelSchema } from '../types/api'

export const schemasApi = {
  get: (schemaId: string): Promise<LabelSchema> =>
    client.get<LabelSchema>(`/schemas/${schemaId}`).then((r) => r.data),
}
