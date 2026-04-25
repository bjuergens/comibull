import { Button, Group, Loader, Paper, Progress, Stack, Text } from '@mantine/core';
import { type PageItem, isPageAnalyzed, isPageError, isPageProcessing } from './comic-detail';

interface Props {
  page: PageItem;
  onStart: () => void;
}

export function PageAnalysisStatus({ page, onStart }: Props) {
  const isError = isPageError(page);
  const isProcessing = isPageProcessing(page);
  const isIdle = !isError && !isProcessing;

  // Idle + already-analyzed: nothing to prompt. Re-analysis goes through the overflow menu.
  if (isIdle && isPageAnalyzed(page)) return null;

  return (
    <Paper
      withBorder
      p="sm"
      mb="xs"
      bg={isError ? 'var(--mantine-color-red-0)' : undefined}
      style={isError ? { borderColor: 'var(--mantine-color-red-4)' } : undefined}
    >
      <Stack gap={6}>
        {isIdle && (
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Stack gap={0} style={{ flex: 1, minWidth: 220 }}>
              <Text size="sm" fw={600}>Diese Seite ist noch nicht analysiert.</Text>
              <Text size="xs" c="dimmed">
                Die Analyse erkennt Sprechblasen und übersetzt den Text. Dauert meist 1–2 Minuten.
              </Text>
            </Stack>
            <Button data-testid="detect-and-analyze-btn" size="sm" onClick={onStart}>
              Seite analysieren
            </Button>
          </Group>
        )}

        {isProcessing && (
          <>
            <Group gap="xs" wrap="nowrap">
              <Loader size="sm" />
              <Text size="sm" fw={600}>Seite wird analysiert…</Text>
            </Group>
            <Progress value={100} animated striped size="xs" />
            <Text size="xs" c="dimmed">
              Dauert meist 1–2 Minuten. Du kannst zu anderen Seiten wechseln — die Analyse läuft im Hintergrund weiter.
            </Text>
          </>
        )}

        {isError && (
          <>
            <Text size="sm" fw={600} c="red">Analyse fehlgeschlagen</Text>
            {page.error_message && <Text size="sm">{page.error_message}</Text>}
            <Group gap="xs">
              <Button size="compact-sm" color="red" onClick={onStart}>
                Erneut versuchen
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
