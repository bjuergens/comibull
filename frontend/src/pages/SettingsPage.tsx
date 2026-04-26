import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useLayoutContext } from '../components/AppLayout';
import { useSettings } from '../SettingsContext';
import {
  clearAllSettings,
  clearApiKey,
  getEffectiveModelConfig,
  readApiKey,
  readDebugMode,
  resetModelConfig,
  writeApiKey,
  writeDebugMode,
  writeModelConfig,
} from '../user-settings';
import { testApiKey, AnthropicError } from '../anthropic';
import {
  ALLOWED_AI_MODELS,
  type AiCallType,
  LANGUAGE_LABELS,
  SOURCE_LANGUAGES,
} from '../shared-types';
import { cacheClear, clearAll, listCallLog, storageStats, type CallLogEntry } from '../store';
import { showError, showSuccess } from '../notifications';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const CALL_TYPES: AiCallType[] = ['detect', 'analyze'];
const CALL_TYPE_LABEL: Record<AiCallType, string> = {
  detect: 'Erkennung + OCR (Vision)',
  analyze: 'Sprachanalyse (Text)',
};

export default function SettingsPage() {
  const { setBreadcrumbs } = useLayoutContext();
  useEffect(() => {
    setBreadcrumbs([{ label: 'Einstellungen' }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const { settings, setSetting } = useSettings();

  const [apiKey, setApiKey] = useState(() => readApiKey() ?? '');
  const [debugMode, setDebugModeState] = useState(() => readDebugMode());
  const [testing, setTesting] = useState(false);
  const [modelFor, setModelFor] = useState<Record<AiCallType, string>>(() => ({
    detect: getEffectiveModelConfig('detect').model,
    analyze: getEffectiveModelConfig('analyze').model,
  }));

  const [stats, setStats] = useState<{ comics: number; pages: number; cache: number; logs: number; bytes: number } | null>(null);
  const [log, setLog] = useState<CallLogEntry[]>([]);
  const [tokenTotal, setTokenTotal] = useState({
    spentInput: 0, spentOutput: 0, savedInput: 0, savedOutput: 0,
  });

  const refreshDiag = useCallback(async () => {
    const [s, l] = await Promise.all([storageStats(), listCallLog(100)]);
    setStats(s);
    setLog(l);
    const total = l.reduce((acc, e) => {
      if (e.cache_hit) {
        return { ...acc, savedInput: acc.savedInput + e.input_tokens, savedOutput: acc.savedOutput + e.output_tokens };
      }
      return { ...acc, spentInput: acc.spentInput + e.input_tokens, spentOutput: acc.spentOutput + e.output_tokens };
    }, { spentInput: 0, spentOutput: 0, savedInput: 0, savedOutput: 0 });
    setTokenTotal(total);
  }, []);

  useEffect(() => { void refreshDiag(); }, [refreshDiag]);

  async function handleSaveKey() {
    if (!apiKey.trim()) return;
    setTesting(true);
    try {
      await testApiKey(apiKey.trim());
      writeApiKey(apiKey.trim());
      showSuccess('API-Schlüssel gespeichert', 'Der Schlüssel funktioniert.');
    } catch (err) {
      if (err instanceof AnthropicError) showError('Schlüssel ungültig', err.message);
      else showError('Test fehlgeschlagen', err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setTesting(false);
    }
  }

  function handleClearKey() {
    clearApiKey();
    setApiKey('');
  }

  function handleModelChange(call_type: AiCallType, model: string) {
    const current = getEffectiveModelConfig(call_type);
    writeModelConfig(call_type, { ...current, model });
    setModelFor(prev => ({ ...prev, [call_type]: model }));
  }

  function handleResetModels() {
    resetModelConfig();
    setModelFor({
      detect: getEffectiveModelConfig('detect').model,
      analyze: getEffectiveModelConfig('analyze').model,
    });
  }

  async function handleClearCache() {
    await cacheClear();
    await refreshDiag();
    showSuccess('Cache geleert', '');
  }

  async function handleWipe() {
    if (!confirm('Alle Daten (Comics, Seiten, Cache, Einstellungen, API-Schlüssel) löschen?')) return;
    await clearAll();
    clearAllSettings();
    setApiKey('');
    setDebugModeState(false);
    await refreshDiag();
    showSuccess('Alles gelöscht', 'Seite neu laden für sauberen Zustand.');
  }

  return (
    <Container size="md" pt="md">
      <Stack gap="xl">
        <Title order={2}>Einstellungen</Title>

        {/* API Key */}
        <section>
          <Title order={4} mb="xs">Anthropic-API-Schlüssel</Title>
          <Stack gap="xs">
            <Alert color="yellow" variant="light">
              Der Schlüssel wird nur auf diesem Gerät gespeichert und direkt an{' '}
              <Text span fw={600}>api.anthropic.com</Text> geschickt. Auf gemeinsam genutzten Geräten
              solltest du ihn nach dem Benutzen wieder entfernen.
            </Alert>
            <PasswordInput
              label="API-Schlüssel"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
            <Group>
              <Button onClick={() => { void handleSaveKey(); }} loading={testing} disabled={!apiKey.trim()}>
                Speichern &amp; Testen
              </Button>
              <Button variant="subtle" color="red" onClick={handleClearKey} disabled={!apiKey}>
                Entfernen
              </Button>
            </Group>
          </Stack>
        </section>

        <Divider />

        {/* App preferences */}
        <section>
          <Title order={4} mb="xs">App-Einstellungen</Title>
          <Stack gap="sm">
            <Select
              label="Standard-Sprache für neue Comics"
              data={SOURCE_LANGUAGES.map(l => ({ value: l, label: LANGUAGE_LABELS[l].de }))}
              value={settings.defaultLanguage}
              onChange={(v) => { if (v === 'fr' || v === 'ja') setSetting('defaultLanguage', v); }}
            />
            <Switch
              label="Textboxen im Leser bearbeitbar"
              checked={settings.canEditTextboxes}
              onChange={(e) => setSetting('canEditTextboxes', e.currentTarget.checked)}
            />
            <Switch
              label="Debug-Modus (Debug-Werte im Leser)"
              checked={debugMode}
              onChange={(e) => { writeDebugMode(e.currentTarget.checked); setDebugModeState(e.currentTarget.checked); }}
            />
          </Stack>
        </section>

        <Divider />

        {/* Model picker */}
        <section>
          <Group justify="space-between" mb="xs">
            <Title order={4}>KI-Modelle</Title>
            <Button variant="subtle" size="compact-xs" onClick={handleResetModels}>
              Zurücksetzen
            </Button>
          </Group>
          <Stack gap="sm">
            {CALL_TYPES.map(ct => (
              <Select
                key={ct}
                label={CALL_TYPE_LABEL[ct]}
                data={ALLOWED_AI_MODELS.map(m => ({ value: m.id, label: m.label }))}
                value={modelFor[ct]}
                onChange={(v) => { if (v) handleModelChange(ct, v); }}
              />
            ))}
          </Stack>
        </section>

        <Divider />

        {/* Diagnostics */}
        <section>
          <Group justify="space-between" mb="xs">
            <Title order={4}>Diagnose</Title>
            <Button variant="subtle" size="compact-xs" onClick={() => { void refreshDiag(); }}>
              Aktualisieren
            </Button>
          </Group>
          {stats && (
            <Text size="sm" c="dimmed" mb="sm">
              {stats.comics} Comics · {stats.pages} Seiten · {stats.cache} Cache-Einträge · {stats.logs} geloggte Aufrufe · {formatBytes(stats.bytes)} belegt
            </Text>
          )}
          <Text size="sm" mb={2}>
            Letzte 100 API-Aufrufe: {tokenTotal.spentInput} Input-Tokens, {tokenTotal.spentOutput} Output-Tokens
          </Text>
          <Text size="sm" c="teal" mb="sm">
            Durch Cache gespart: {tokenTotal.savedInput} Input-Tokens, {tokenTotal.savedOutput} Output-Tokens
          </Text>

          <Group mb="sm">
            <Button variant="subtle" onClick={() => { void handleClearCache(); }}>Cache leeren</Button>
            <Button variant="light" color="red" onClick={() => { void handleWipe(); }}>
              Alle Daten löschen
            </Button>
          </Group>

          {log.length > 0 && (
            <Table striped withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Zeit</Table.Th>
                  <Table.Th>Typ</Table.Th>
                  <Table.Th>Modell</Table.Th>
                  <Table.Th>Input</Table.Th>
                  <Table.Th>Output</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {log.slice(0, 30).map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>{new Date(entry.created_at).toLocaleTimeString()}</Table.Td>
                    <Table.Td>
                      {entry.call_type}
                      {entry.cache_hit && <Badge size="xs" color="teal" variant="light" ml={4}>cache</Badge>}
                    </Table.Td>
                    <Table.Td>{entry.model}</Table.Td>
                    <Table.Td>{entry.input_tokens}</Table.Td>
                    <Table.Td>{entry.output_tokens}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </section>

        <Text size="xs" c="dimmed" ta="center">
          ComiBulle — Build {import.meta.env.VITE_BUILD_TIME ?? 'dev'}
        </Text>
      </Stack>
    </Container>
  );
}
