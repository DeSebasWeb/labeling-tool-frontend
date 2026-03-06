import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkspacesPage from './pages/WorkspacesPage'
import DocumentsPage from './pages/DocumentsPage'
import EditorPage from './pages/EditorPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId" element={<DocumentsPage />} />
          <Route path="/workspaces/:workspaceId/editor/:blobName" element={<EditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
