import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Title, Table, Button, Group, Text, Loader, Anchor, Badge, Stack, Paper } from '@mantine/core';
import { useLayoutContext } from '../components/AppLayout';
import { deleteComic, listComics, listPages, type ComicRow } from '../store';
import { LANGUAGE_LABELS } from '../shared-types';
import { showSuccess } from '../notifications';

interface ComicListItem extends ComicRow {
  page_count: number;
  pages_analyzed: number;
}

export default function ComicListPage() {
  const navigate = useNavigate();
  const [comics, setComics] = useState<ComicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { setBreadcrumbs } = useLayoutContext();
  useEffect(() => { setBreadcrumbs([]); return () => setBreadcrumbs([]); }, [setBreadcrumbs]);

  const fetchComics = useCallback(async () => {
    try {
      const rows = await listComics();
      const enriched: ComicListItem[] = await Promise.all(rows.map(async (c) => {
        const pages = await listPages(c.id);
        const analyzed = pages.filter(p => p.regions !== null && p.regions.every(r => r.analysis != null)).length;
        return { ...c, page_count: pages.length, pages_analyzed: analyzed };
      }));
      setComics(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchComics(); }, [fetchComics]);

  async function handleDelete(id: number) {
    const title = comics.find(c => c.id === id)?.title ?? '';
    await deleteComic(id);
    setComics(prev => prev.filter(c => c.id !== id));
    showSuccess('Comic gelöscht', title);
  }

  if (loading) return <Container pt="xl"><Loader /></Container>;

  return (
    <Container size="lg" pt="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Meine Comics</Title>
        <Button data-testid="upload-btn" onClick={() => void navigate('/upload')}>
          Hochladen
        </Button>
      </Group>

      {comics.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Stack align="center" gap="md">
            <Text size="lg" fw={500}>Noch keine Comics</Text>
            <Text size="sm" c="dimmed">
              Alle Daten bleiben auf diesem Gerät. Für Texterkennung und Analyse wird dein
              eigener Anthropic-API-Schlüssel benötigt — setze ihn unter „Einstellungen“.
            </Text>
            <Button onClick={() => void navigate('/upload')}>Ersten Comic hochladen</Button>
          </Stack>
        </Paper>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Titel</Table.Th>
              <Table.Th>Seiten</Table.Th>
              <Table.Th>Erstellt</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comics.map(comic => {
              const allAnalyzed = comic.pages_analyzed === comic.page_count && comic.page_count > 0;
              return (
                <Table.Tr key={comic.id} data-testid="comic-card">
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge size="xs" variant="light" color="gray">
                        {LANGUAGE_LABELS[comic.source_language]?.de.slice(0, 2).toUpperCase() ?? comic.source_language.toUpperCase()}
                      </Badge>
                      <Anchor
                        href={`/comics/${comic.id}`}
                        onClick={(e) => { e.preventDefault(); void navigate(`/comics/${comic.id}`); }}
                      >
                        {comic.title}
                      </Anchor>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm">{comic.page_count} Seiten</Text>
                      {comic.page_count > 0 && (
                        allAnalyzed
                          ? <Badge size="xs" color="green" variant="light">Alle analysiert</Badge>
                          : <Badge size="xs" color="gray" variant="light">
                              {comic.pages_analyzed}/{comic.page_count} analysiert
                            </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{new Date(comic.created_at).toLocaleDateString()}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        variant="subtle"
                        size="compact-sm"
                        onClick={() => void navigate(`/comics/${comic.id}/edit`)}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        variant="subtle"
                        color="red"
                        size="compact-sm"
                        onClick={() => { void handleDelete(comic.id); }}
                      >
                        Löschen
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Container>
  );
}
