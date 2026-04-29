import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from './SettingsContext';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import ComicListPage from './pages/ComicListPage';
import ComicDetailPage from './pages/ComicDetailPage';
import ComicEditPage from './pages/ComicEditPage';
import UploadPage from './pages/UploadPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { db } from './store';
import './app.css';

export default function App() {
  // Boot the IndexedDB connection so the upgrade callback fires before any
  // page tries to read.
  useEffect(() => {
    void db();
  }, []);

  return (
    <HashRouter>
      <SettingsProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<ComicListPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/comics/:id" element={<ComicDetailPage />} />
            <Route path="/comics/:id/edit" element={<ComicEditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SettingsProvider>
    </HashRouter>
  );
}
