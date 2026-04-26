import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  FileInput,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useComicBreadcrumbs } from './useComicBreadcrumbs';
import {
  addPages,
  deletePage,
  getComic,
  listPages,
  swapPagePositions,
  updateComic,
  type ComicRow,
  type PageRow,
} from '../store';
import {
  buildComicDetail,
  pageBadge,
  pagePreviewText,
  isPageProcessing,
  type ComicDetail,
  type PageItem,
} from './comic-detail';
import { LANGUAGE_LABELS } from '../shared-types';

export default function ComicEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Number(undefined) === NaN, so this handles both "no id" and "garbage id".
  const idNum = Number(id);
  const [comic, setComic] = useState<ComicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const urlsRef = useRef<string[]>([]);

  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [reordering, setReordering] = useState(false);

  const fetchComic = useCallback(async (): Promise<ComicRow | null> => {
    if (Number.isNaN(idNum)) return null;
    const row = await getComic(idNum);
    if (!row) { setLoading(false); return null; }
    const pages: PageRow[] = await listPages(idNum);
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    const detail = buildComicDetail(row, pages);
    urlsRef.current = detail.pages.map(p => p.image_url);
    setComic(detail);
    setEditTitle(row.title);
    setLoading(false);
    return row;
  }, [idNum]);

  useEffect(() => { void fetchComic(); }, [fetchComic]);
  useEffect(() => () => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
  }, []);

  useComicBreadcrumbs(id, comic?.title, 'Bearbeiten');

  async function handleSaveTitle() {
    if (Number.isNaN(idNum) || !editTitle.trim() || editTitle === comic?.title) return;
    setSavingTitle(true);
    try {
      await updateComic(idNum, { title: editTitle.trim() });
      await fetchComic();
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleUpload() {
    if (Number.isNaN(idNum) || uploadFiles.length === 0) return;
    setUploading(true);
    try {
      await addPages(idNum, uploadFiles);
      setUploadFiles([]);
      await fetchComic();
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePage() {
    if (Number.isNaN(idNum) || !deleteTarget) return;
    setDeleting(true);
    try {
      await deletePage(idNum, deleteTarget.id);
      setDeleteTarget(null);
      await fetchComic();
    } finally {
      setDeleting(false);
    }
  }

  async function swapPages(pageId: number, direction: 'up' | 'down') {
    if (!comic || Number.isNaN(idNum)) return;
    const pages = comic.pages;
    const idx = pages.findIndex(p => p.id === pageId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= pages.length) return;

    setReordering(true);
    try {
      await swapPagePositions(idNum, pageId, pages[swapIdx]!.id);
      await fetchComic();
    } finally {
      setReordering(false);
    }
  }

  if (loading) return <Container pt="xl"><Loader /></Container>;
  if (!comic) return <Container pt="xl" />;

  const titleChanged = editTitle.trim() !== comic.title;

  return (
    <Container size="lg" pt="md">
      <Group mb="md" align="center" gap="sm">
        <Title order={2}>Comic bearbeiten</Title>
        <Badge variant="light" color="gray">{LANGUAGE_LABELS[comic.source_language]?.de ?? comic.source_language}</Badge>
      </Group>

      <Group mb="lg" align="end">
        <TextInput
          label="Comic-Titel"
          value={editTitle}
          onChange={(e) => setEditTitle(e.currentTarget.value)}
          style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveTitle(); }}
        />
        <Button
          onClick={() => { void handleSaveTitle(); }}
          loading={savingTitle}
          disabled={!titleChanged}
        >
          Titel speichern
        </Button>
      </Group>

      <Title order={4} mb="sm">Seiten ({comic.pages.length})</Title>
      {comic.pages.length === 0 ? (
        <Text c="dimmed" mb="md">Keine Seiten. Lade unten welche hoch.</Text>
      ) : (
        <Table striped highlightOnHover mb="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Bereiche</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Vorschau</Table.Th>
              <Table.Th>Aktionen</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comic.pages.map((page, idx) => (
              <Table.Tr key={page.id}>
                <Table.Td>{page.regions ? `${page.regions.length} Box${page.regions.length !== 1 ? 'en' : ''}` : '—'}</Table.Td>
                <Table.Td>{(() => {
                  const b = pageBadge(page);
                  const badge = <Badge size="sm" color={b.color} variant="light" style={b.tooltip ? { cursor: 'help' } : undefined}>{b.label}</Badge>;
                  return b.tooltip
                    ? <Tooltip label={b.tooltip} multiline maw={300}>{badge}</Tooltip>
                    : badge;
                })()}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed" truncate style={{ maxWidth: 150 }}>
                    {pagePreviewText(page)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => void navigate(`/comics/${id}?page=${idx + 1}`)}
                    >
                      Öffnen
                    </Button>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={idx === 0 || reordering}
                      onClick={() => { void swapPages(page.id, 'up'); }}
                      aria-label="Nach oben"
                    >
                      ↑
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={idx === comic.pages.length - 1 || reordering}
                      onClick={() => { void swapPages(page.id, 'down'); }}
                      aria-label="Nach unten"
                    >
                      ↓
                    </ActionIcon>
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-xs"
                      onClick={() => setDeleteTarget(page)}
                      disabled={isPageProcessing(page)}
                    >
                      Löschen
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Stack gap="sm" mb="lg">
        <Title order={4}>Seiten hinzufügen</Title>
        <Group align="end">
          <FileInput
            label="Bilder auswählen"
            placeholder="Dateien wählen..."
            multiple
            accept="image/png,image/jpeg,image/webp"
            value={uploadFiles}
            onChange={setUploadFiles}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => { void handleUpload(); }}
            loading={uploading}
            disabled={uploadFiles.length === 0}
          >
            Hochladen
          </Button>
        </Group>
      </Stack>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Seite löschen"
      >
        {deleteTarget && (
          <Stack>
            <Text>Möchtest du Seite {deleteTarget.page_number} wirklich löschen?</Text>
            <Text c="red" size="sm">Die Seite und alle Analysen werden unwiderruflich entfernt.</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
              <Button color="red" onClick={() => { void handleDeletePage(); }} loading={deleting}>
                Seite löschen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
