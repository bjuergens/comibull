import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Anchor, Container, Title, Text, Stack, Button, Group, Alert, List } from '@mantine/core';
import { useLayoutContext } from '../components/AppLayout';
import { readApiKey } from '../user-settings';

export default function HomePage() {
  const navigate = useNavigate();
  const { setBreadcrumbs } = useLayoutContext();
  useEffect(() => { setBreadcrumbs([]); return () => setBreadcrumbs([]); }, [setBreadcrumbs]);

  const hasKey = readApiKey() !== null;

  return (
    <Container size="sm" pt="md">
      <Stack gap="lg">
        <Stack align="center" gap={4}>
          <Title order={2}>ComiBulle</Title>
          <Text c="dimmed" ta="center">
            Lerne Sprachen, indem du Comics liest. Alles läuft lokal im Browser — dein
            Anthropic-API-Schlüssel und deine Comics verlassen dieses Gerät nicht.
          </Text>
        </Stack>

        {!hasKey && (
          <Alert color="yellow">
            Noch kein API-Schlüssel hinterlegt. Ohne Schlüssel kannst du keine Seiten analysieren.
          </Alert>
        )}

        <Group justify="center" gap="sm">
          <Button onClick={() => void navigate('/library')}>
            Zur Bibliothek
          </Button>
          <Button variant="light" onClick={() => void navigate('/upload')}>
            Comic hochladen
          </Button>
          <Button variant="subtle" onClick={() => void navigate('/settings')}>
            Einstellungen
          </Button>
        </Group>

        <Stack gap="xs">
          <Title order={4}>Was du dafür brauchst</Title>
          <List size="sm" spacing={4}>
            <List.Item>
              📚 Comics in deiner Zielsprache als Bilddatei (PDF/CBZ vorher entpacken,
              oder physische Comics mit Kamera oder Scanner abfotografieren).
            </List.Item>
            <List.Item>
              🔑 Einen Anthropic-Account auf{' '}
              <Anchor href="https://console.anthropic.com/" target="_blank" rel="noopener">
                console.anthropic.com
              </Anchor>
              {' '}für die Sprachanalyse (Pflicht).
            </List.Item>
            <List.Item>
              🔑 Optional: einen Google-Cloud-Account auf{' '}
              <Anchor href="https://console.cloud.google.com/" target="_blank" rel="noopener">
                console.cloud.google.com
              </Anchor>
              {' '}für günstigere OCR via Cloud Vision (Alternative zur Claude-Vision).
            </List.Item>
            <List.Item>
              💳 Eine Kreditkarte für die obigen APIs — beide rechnen Pay-as-you-go ab.
            </List.Item>
            <List.Item>
              💰 Budget: ca. 0,5 – 5 Cent pro Seite, je nach Anbieter und gewähltem Modell.
            </List.Item>
            <List.Item>
              🌐 Internetverbindung während der Analyse einer Seite. Bereits analysierte
              Seiten lassen sich offline weiterlesen.
            </List.Item>
          </List>
        </Stack>
      </Stack>
    </Container>
  );
}
