import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  List,
  NumberInput,
  PasswordInput,
  Select,
  Spoiler,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useLayoutContext } from '../components/AppLayout';
import { useSettings } from '../SettingsContext';
import {
  clearAllSettingsExceptApiKey,
  clearApiKey,
  clearGoogleApiKey,
  getEffectiveModelConfig,
  readApiKey,
  readDebugMode,
  readGoogleApiKey,
  resetModelConfig,
  writeApiKey,
  writeDebugMode,
  writeGoogleApiKey,
  writeModelConfig,
} from '../user-settings';
import { testApiKey, AnthropicError } from '../anthropic';
import { testGoogleApiKey, GoogleVisionError } from '../google-vision';
import {
  ALLOWED_AI_MODELS,
  ALLOWED_PROVIDERS_FOR,
  type AiCallType,
  type AiProvider,
  type CallTypeConfig,
  DEFAULT_PDF_RENDER_SCALE,
  GOOGLE_VISION_MODEL_ID,
  LANGUAGE_LABELS,
  PROVIDER_LABEL,
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
  const [googleKey, setGoogleKey] = useState(() => readGoogleApiKey() ?? '');
  const [debugMode, setDebugModeState] = useState(() => readDebugMode());
  const [testing, setTesting] = useState(false);
  const [testingGoogle, setTestingGoogle] = useState(false);
  const [cfgFor, setCfgFor] = useState<Record<AiCallType, { provider: AiProvider; model: string }>>(() => {
    const d = getEffectiveModelConfig('detect');
    const a = getEffectiveModelConfig('analyze');
    return {
      detect: { provider: d.provider ?? 'anthropic', model: d.model },
      analyze: { provider: a.provider ?? 'anthropic', model: a.model },
    };
  });

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

  async function handleSaveGoogleKey() {
    if (!googleKey.trim()) return;
    setTestingGoogle(true);
    try {
      await testGoogleApiKey(googleKey.trim());
      writeGoogleApiKey(googleKey.trim());
      showSuccess('Google-API-Schlüssel gespeichert', 'Der Schlüssel funktioniert.');
    } catch (err) {
      if (err instanceof GoogleVisionError) showError('Schlüssel ungültig', err.message);
      else showError('Test fehlgeschlagen', err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setTestingGoogle(false);
    }
  }

  function handleClearGoogleKey() {
    clearGoogleApiKey();
    setGoogleKey('');
  }

  function persistConfig(call_type: AiCallType, next: { provider: AiProvider; model: string }) {
    const current = getEffectiveModelConfig(call_type);
    const merged: CallTypeConfig = { ...current, model: next.model, provider: next.provider };
    writeModelConfig(call_type, merged);
    setCfgFor(prev => ({ ...prev, [call_type]: next }));
  }

  function handleProviderChange(call_type: AiCallType, provider: AiProvider) {
    // Switching to Google for detect: pin the sentinel model id so the call
    // log shows something coherent. Switching back to Anthropic: restore
    // a sensible Claude model (the previous one if it was a Claude id, else
    // the default).
    let model = cfgFor[call_type].model;
    if (provider === 'google') {
      model = GOOGLE_VISION_MODEL_ID;
    } else if (model === GOOGLE_VISION_MODEL_ID) {
      model = getEffectiveModelConfig(call_type).model === GOOGLE_VISION_MODEL_ID
        ? (ALLOWED_AI_MODELS[1]?.id ?? ALLOWED_AI_MODELS[0]!.id)
        : getEffectiveModelConfig(call_type).model;
    }
    persistConfig(call_type, { provider, model });
  }

  function handleModelChange(call_type: AiCallType, model: string) {
    persistConfig(call_type, { ...cfgFor[call_type], model });
  }

  function handleResetModels() {
    resetModelConfig();
    const d = getEffectiveModelConfig('detect');
    const a = getEffectiveModelConfig('analyze');
    setCfgFor({
      detect: { provider: d.provider ?? 'anthropic', model: d.model },
      analyze: { provider: a.provider ?? 'anthropic', model: a.model },
    });
  }

  async function handleClearCache() {
    await cacheClear();
    await refreshDiag();
    showSuccess('Cache geleert', '');
  }

  async function handleWipe() {
    if (!confirm('Alle Daten (Comics, Seiten, Cache, Einstellungen) löschen? Der API-Schlüssel bleibt erhalten.')) return;
    await clearAll();
    clearAllSettingsExceptApiKey();
    setDebugModeState(false);
    await refreshDiag();
    showSuccess('Daten gelöscht', 'API-Schlüssel bleibt erhalten. Seite neu laden für sauberen Zustand.');
  }

  return (
    <Container size="md" pt="md">
      <Stack gap="xl">
        <Title order={2}>Einstellungen</Title>

        {/* Anthropic API Key */}
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

        {/* Google Vision API Key — optional alternative OCR provider */}
        <section>
          <Title order={4} mb="xs">Google-Cloud-Vision-API-Schlüssel (optional)</Title>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Alternative für die Erkennung + OCR. Wird nur verwendet, wenn unten als Anbieter
              für „Erkennung + OCR" Google Cloud Vision ausgewählt ist.
            </Text>
            <PasswordInput
              label="Google-API-Schlüssel"
              placeholder="AIza..."
              value={googleKey}
              onChange={(e) => setGoogleKey(e.currentTarget.value)}
            />
            <Group>
              <Button onClick={() => { void handleSaveGoogleKey(); }} loading={testingGoogle} disabled={!googleKey.trim()}>
                Speichern &amp; Testen
              </Button>
              <Button variant="subtle" color="red" onClick={handleClearGoogleKey} disabled={!googleKey}>
                Entfernen
              </Button>
            </Group>
            <Spoiler maxHeight={0} showLabel="Wie bekomme ich diesen Schlüssel?" hideLabel="Ausblenden">
              <Stack gap={4} mt="xs">
                <List size="sm" type="ordered" spacing={2}>
                  <List.Item>
                    Bei der{' '}
                    <Anchor href="https://console.cloud.google.com/" target="_blank" rel="noopener">
                      Google Cloud Console
                    </Anchor>{' '}
                    anmelden.
                  </List.Item>
                  <List.Item>Projekt erstellen oder ein bestehendes auswählen.</List.Item>
                  <List.Item>
                    <Anchor
                      href="https://console.cloud.google.com/apis/library/vision.googleapis.com"
                      target="_blank"
                      rel="noopener"
                    >
                      Cloud Vision API aktivieren
                    </Anchor>
                    .
                  </List.Item>
                  <List.Item>
                    Unter „APIs &amp; Services" → „Credentials" einen neuen API-Schlüssel erstellen.
                  </List.Item>
                  <List.Item>
                    Optional: Schlüssel auf die Cloud Vision API beschränken (API restrictions).
                  </List.Item>
                  <List.Item>
                    Hinweis: HTTP-Referrer-Beschränkungen funktionieren <Text span fw={600}>nicht</Text>{' '}
                    bei Aufrufen aus dem Browser. Lasse die Application restrictions auf „None" oder verwende IP-Beschränkungen.
                  </List.Item>
                  <List.Item>
                    Abrechnung: Erste 1000 Aufrufe pro Monat sind kostenlos, danach kostenpflichtig.
                  </List.Item>
                </List>
              </Stack>
            </Spoiler>
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
            <NumberInput
              label="WebP-Qualität für neue Seiten (1–100)"
              description="Niedrigere Werte = kleinere Dateien. Standard: 50. Wirkt nur auf neue Uploads."
              min={1}
              max={100}
              value={settings.webpQuality}
              onChange={(v) => { if (typeof v === 'number') setSetting('webpQuality', v); }}
            />
            <NumberInput
              label="PDF-Renderauflösung (Skalierung)"
              description="Skalierung gegenüber der nativen PDF-Größe (72 dpi). 2.0 ≈ 144 dpi. Höher = schärfer, aber größere Dateien und längere Verarbeitung. Standard: 2."
              min={0.5}
              max={6}
              step={0.25}
              decimalScale={2}
              value={settings.pdfRenderScale ?? DEFAULT_PDF_RENDER_SCALE}
              onChange={(v) => { if (typeof v === 'number') setSetting('pdfRenderScale', v); }}
            />
          </Stack>
        </section>

        <Divider />

        {/* Model & provider picker */}
        <section>
          <Group justify="space-between" mb="xs">
            <Title order={4}>KI-Pipeline pro Schritt</Title>
            <Button variant="subtle" size="compact-xs" onClick={handleResetModels}>
              Zurücksetzen
            </Button>
          </Group>
          <Stack gap="md">
            {CALL_TYPES.map(ct => {
              const providers = ALLOWED_PROVIDERS_FOR[ct];
              const isGoogle = cfgFor[ct].provider === 'google';
              return (
                <Stack key={ct} gap="xs">
                  <Text fw={500}>{CALL_TYPE_LABEL[ct]}</Text>
                  {providers.length > 1 && (
                    <Select
                      label="Anbieter"
                      data={providers.map(p => ({ value: p, label: PROVIDER_LABEL[p] }))}
                      value={cfgFor[ct].provider}
                      onChange={(v) => { if (v === 'anthropic' || v === 'google') handleProviderChange(ct, v); }}
                    />
                  )}
                  {isGoogle ? (
                    <>
                      <TextInput
                        label="Modell"
                        value="DOCUMENT_TEXT_DETECTION"
                        readOnly
                        description="Google Vision verwendet ein festes OCR-Modell."
                      />
                      {ct === 'detect' && (
                        <>
                          <Select
                            label="Granularität"
                            description="Absätze: feinkörnig (Standard). Blöcke: gröber, kombiniert benachbarte Absätze."
                            data={[
                              { value: 'paragraphs', label: 'Absätze (Paragraphs)' },
                              { value: 'blocks', label: 'Blöcke (Blocks)' },
                            ]}
                            value={settings.googleVisionGranularity ?? 'paragraphs'}
                            onChange={(v) => {
                              if (v === 'paragraphs' || v === 'blocks') {
                                setSetting('googleVisionGranularity', v);
                              }
                            }}
                          />
                          <Switch
                            label="Nahe Boxen zusammenführen"
                            description="Klebt Boxen zusammen, die vertikal nah beieinander liegen und horizontal überlappen — typisch mehrzeiliger Sprechblasentext."
                            checked={settings.googleVisionMergeCloseBoxes ?? false}
                            onChange={(e) => setSetting('googleVisionMergeCloseBoxes', e.currentTarget.checked)}
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <Select
                      label="Modell"
                      data={ALLOWED_AI_MODELS.map(m => ({ value: m.id, label: m.label }))}
                      value={cfgFor[ct].model}
                      onChange={(v) => { if (v) handleModelChange(ct, v); }}
                    />
                  )}
                </Stack>
              );
            })}
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
              Daten löschen (Schlüssel bleibt)
            </Button>
          </Group>

          {log.length > 0 && (
            <Table striped withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Zeit</Table.Th>
                  <Table.Th>Typ</Table.Th>
                  <Table.Th>Anbieter</Table.Th>
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
                    <Table.Td>{entry.provider}</Table.Td>
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
