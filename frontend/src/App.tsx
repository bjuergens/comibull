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
import { consumeMigrationNotice, db } from './store';
import { showInfo, showWarning } from './notifications';
import './app.css';

export default function App() {
  // Boot the IndexedDB connection so the upgrade callback fires, then surface
  // a toast if it wiped data. consumeMigrationNotice is one-shot — safe under
  // StrictMode's double-mount.
  useEffect(() => {
    void db().then(() => {
      const m = consumeMigrationNotice();
      if (m) {
        if (m.wiped) {
          showWarning(
            'Datenbank zurückgesetzt',
            `Schema von v${m.oldVersion} auf v${m.newVersion} aktualisiert — alle Comics und der KI-Cache wurden gelöscht. Der API-Schlüssel bleibt erhalten.`,
          );
        } else {
          showInfo(
            'Datenbank aktualisiert',
            `Schema von v${m.oldVersion} auf v${m.newVersion} aktualisiert. Daten bleiben erhalten.`,
          );
        }
      }
    });
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
