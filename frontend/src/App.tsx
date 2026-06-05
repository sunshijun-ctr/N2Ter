import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { UploadPage } from '@/pages/UploadPage'
import { PreprocessPage } from '@/pages/PreprocessPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { EditorPage } from '@/pages/EditorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<UploadPage />} />
          <Route path="preprocess" element={<PreprocessPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="editor" element={<EditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
