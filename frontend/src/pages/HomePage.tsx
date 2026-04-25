import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Title, Text, Stack, Button, Group, Alert } from '@mantine/core';
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
      </Stack>
    </Container>
  );
}
