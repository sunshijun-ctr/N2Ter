import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { UploadPage } from '@/pages/UploadPage'
import { PreprocessPage } from '@/pages/PreprocessPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SchemaSelectPage } from '@/pages/SchemaSelectPage'
import { AdaptationPlanPage } from '@/pages/AdaptationPlanPage'
import { EditorPage } from '@/pages/EditorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<UploadPage />} />
          <Route path="preprocess" element={<PreprocessPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="schema-select" element={<SchemaSelectPage />} />
          <Route path="adaptation-plan" element={<AdaptationPlanPage />} />
          <Route path="editor" element={<EditorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
