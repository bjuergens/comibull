import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Title, Button, TextInput, Text, Group, Stack, Select } from '@mantine/core';
import { useLayoutContext } from '../components/AppLayout';
import { useSettings } from '../SettingsContext';
import { showError } from '../notifications';
import { addPages, createComic } from '../store';
import { toWebp } from '../image-conversion';
import { extractPdfPages, isPdfFile } from '../pdf-extraction';
import { DEFAULT_PDF_RENDER_SCALE, LANGUAGE_LABELS, SOURCE_LANGUAGES } from '../shared-types';

export default function UploadPage() {
  const navigate = useNavigate();
  const { setBreadcrumbs } = useLayoutContext();
  const { settings, setSetting } = useSettings();
  useEffect(() => {
    setBreadcrumbs([{ label: 'Hochladen', href: '/upload' }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const [title, setTitle] = useState('');
  const [pageFiles, setPageFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // Language comes from the user's saved preference; picking a new one drives
  // this upload AND persists as the new default.
  const language = settings.defaultLanguage;

  // PDF flow is "1 PDF -> 1 comic". Mixing a PDF with other files (or
  // selecting multiple PDFs) doesn't make sense here, so reject it at
  // selection time.
  const hasPdf = pageFiles.some(isPdfFile);
  const mixedSelection = hasPdf && pageFiles.length > 1;

  async function handleSubmit() {
    if (pageFiles.length === 0 || mixedSelection) return;
    setUploading(true);
    try {
      const first = pageFiles[0]!;
      const comic = await createComic(title.trim() || first.name.replace(/\.[^.]+$/, ''), language);
      const webpFiles = hasPdf
        ? await extractPdfPages(
            first,
            settings.pdfRenderScale ?? DEFAULT_PDF_RENDER_SCALE,
            settings.webpQuality,
          )
        : await Promise.all(pageFiles.map(f => toWebp(f, settings.webpQuality)));
      await addPages(comic.id, webpFiles);
      void navigate(`/comics/${comic.id}`);
    } catch (err) {
      showError('Hochladen fehlgeschlagen', err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Container size="sm" pt="md">
      <Title order={2} mb="md">Comic hochladen</Title>

      <Stack gap="md">
        <TextInput
          label="Titel (optional)"
          data-testid="upload-title-input"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />

        <Select
          label="Sprache des Comics"
          data={SOURCE_LANGUAGES.map(l => ({ value: l, label: LANGUAGE_LABELS[l].de }))}
          value={language}
          onChange={(val) => { if (val === 'fr' || val === 'ja') setSetting('defaultLanguage', val); }}
        />

        <div>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            data-testid="page-file-input"
            onChange={(e) => setPageFiles(Array.from(e.target.files ?? []))}
          />
          <Text size="xs" c="dimmed" mt="xs">
            Erlaubt: PNG, JPG, WebP oder eine einzelne PDF (1 PDF = 1 Comic). Alles bleibt auf diesem Gerät.
          </Text>
          {pageFiles.length > 0 && !mixedSelection && (
            <Text size="sm" mt="xs">
              {hasPdf ? `PDF ausgewählt: ${pageFiles[0]!.name}` : `${pageFiles.length} Datei(en) ausgewählt`}
            </Text>
          )}
          {mixedSelection && (
            <Text size="sm" mt="xs" c="red">
              Eine PDF kann nur allein hochgeladen werden — bitte nur eine einzelne PDF auswählen oder ausschließlich Bilder.
            </Text>
          )}
        </div>

        <Group>
          <Button
            data-testid="upload-submit-btn"
            onClick={() => { void handleSubmit(); }}
            loading={uploading}
            disabled={pageFiles.length === 0 || mixedSelection}
          >
            Hochladen
          </Button>
          <Button variant="subtle" onClick={() => void navigate('/library')}>
            Abbrechen
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
