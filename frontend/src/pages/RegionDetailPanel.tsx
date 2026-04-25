import { useState } from 'react';
import { Badge, Box, Button, Code, Group, Stack, Table, Text } from '@mantine/core';
import { REGION_TYPE_LABEL, isAnalyzedWithNoText, type CefrLevel, type RegionDetailPanelProps } from './comic-detail';
import classes from './RegionDetailPanel.module.css';

const CEFR_COLORS: Record<CefrLevel, string> = {
  A1: 'teal.3', A2: 'teal.5',
  B1: 'blue.4', B2: 'blue.6',
  C1: 'violet.5', C2: 'violet.7',
};

// Caller remounts via `key={regionIdx}` when selection changes, which also
// resets all the useState below. No manual `useEffect` reset needed.
export function RegionDetailPanel({
  region,
  regionIdx,
  canEditTextboxes,
  debugMode,
  onClose,
  onSaveEdit,
}: RegionDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(region.ocr_text ?? '');
  const [translationRevealed, setTranslationRevealed] = useState(false);
  const [vocabExpanded, setVocabExpanded] = useState(false);
  const [grammarExpanded, setGrammarExpanded] = useState(false);
  const [culturalExpanded, setCulturalExpanded] = useState(false);

  const analysis = region.analysis;
  const [x1, y1, x2, y2] = region.bbox;
  const debugText = debugMode
    ? [
        `source: ${region.source}`,
        `area: ${((x2 - x1) * (y2 - y1) * 100).toFixed(2)}% of image`,
        `analysis: ${analysis ? 'analyzed' : 'not analyzed'}`,
        `bbox: [${region.bbox.map(n => n.toFixed(3)).join(', ')}]`,
      ].join('\n')
    : null;

  function startEdit() {
    setEditText(region.ocr_text ?? '');
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
  }
  function saveEdit() {
    void onSaveEdit(editText);
    setEditing(false);
  }

  return (
    <Stack gap="xs" style={{ position: 'relative' }}>
      <Group gap={4} style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
        {analysis?.difficulty && (
          <Badge size="xs" color={CEFR_COLORS[analysis.difficulty]} variant="light">
            {analysis.difficulty}
          </Badge>
        )}
        <Button variant="subtle" size="compact-xs" onClick={onClose} aria-label="Schließen">
          ✕
        </Button>
      </Group>

      {debugMode && (
        <Text size="sm" fw={600}>
          Region {regionIdx + 1}
          {region.type && ` — ${REGION_TYPE_LABEL[region.type] ?? region.type}`}
        </Text>
      )}

      {isAnalyzedWithNoText(region) ? (
        <Text size="sm" c="dimmed">Kein Text erkannt</Text>
      ) : (
        <>
          {/* OCR Text — italic, no label */}
          {region.ocr_text && (
            <div data-testid="ocr-text">
              {editing ? (
                <Group gap="xs">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.85rem' }}
                  />
                  <Button size="compact-xs" onClick={saveEdit}>Speichern</Button>
                  <Button size="compact-xs" variant="subtle" onClick={cancelEdit}>Abbrechen</Button>
                </Group>
              ) : (
                <Text
                  size="sm"
                  fs="italic"
                  style={{ cursor: canEditTextboxes ? 'pointer' : undefined }}
                  onClick={() => { if (canEditTextboxes) startEdit(); }}
                >
                  {region.ocr_text}
                </Text>
              )}
            </div>
          )}

          {analysis && (
            <div data-testid="analysis-result">
              {/* Vocabulary — collapsed: top 2 items, source+target only. Expanded: all items + notes. */}
              {analysis.vocabulary.length > 0 && (() => {
                const visible = vocabExpanded ? analysis.vocabulary : analysis.vocabulary.slice(0, 2);
                const hasMore = analysis.vocabulary.length > 2 || analysis.vocabulary.some(v => v.notes);
                return (
                  <div>
                    <Group justify="space-between" mb={4}>
                      <Text size="xs" c="dimmed">Vokabeln</Text>
                      {hasMore && (
                        <Text
                          size="xs"
                          c="blue"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setVocabExpanded(!vocabExpanded)}
                        >
                          {vocabExpanded ? '▴ weniger' : `▾ alle ${analysis.vocabulary.length}`}
                        </Text>
                      )}
                    </Group>
                    <Table withTableBorder withColumnBorders>
                      <Table.Tbody>
                        {visible.map((v, i) => (
                          <Table.Tr key={i}>
                            <Table.Td>{v.source}</Table.Td>
                            <Table.Td>{v.target}</Table.Td>
                            {vocabExpanded && <Table.Td>{v.notes}</Table.Td>}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                );
              })()}

              {/* Grammar notes — first entry is the headline, rest expand on click */}
              {analysis.grammar_notes.length > 0 && (
                <div>
                  <Text size="xs" c="dimmed">Grammatik</Text>
                  <Text
                    size="sm"
                    style={{ cursor: analysis.grammar_notes.length > 1 ? 'pointer' : undefined }}
                    onClick={() => { if (analysis.grammar_notes.length > 1) setGrammarExpanded(!grammarExpanded); }}
                  >
                    {analysis.grammar_notes[0]}
                    {analysis.grammar_notes.length > 1 && (
                      <Text span size="xs" c="blue" ml={4}>
                        {grammarExpanded ? '▴' : `▾ +${analysis.grammar_notes.length - 1}`}
                      </Text>
                    )}
                  </Text>
                  {grammarExpanded && analysis.grammar_notes.length > 1 && (
                    <Box mt={4} pl="xs" style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}>
                      {analysis.grammar_notes.slice(1).map((note, i) => (
                        <Text key={i} size="sm" c="dimmed">{note}</Text>
                      ))}
                    </Box>
                  )}
                </div>
              )}

              {/* Cultural Notes — collapsed by default, expand on click */}
              {analysis.cultural_notes ? (
                <div>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setCulturalExpanded(!culturalExpanded)}
                  >
                    Kulturelle Hinweise <Text span size="xs" c="blue">{culturalExpanded ? '▴' : '▾'}</Text>
                  </Text>
                  {culturalExpanded && (
                    <Text size="sm">{analysis.cultural_notes}</Text>
                  )}
                </div>
              ) : null}

              {/* Translation (blurred until clicked) */}
              {analysis.translation && (
                <div>
                  <Text size="xs" c="dimmed">
                    Übersetzung{!translationRevealed && ' (klicken zum Aufdecken)'}
                  </Text>
                  <Box
                    className={translationRevealed ? undefined : classes.translationBlurred}
                    onClick={() => { if (!translationRevealed) setTranslationRevealed(true); }}
                  >
                    <Text size="sm">{analysis.translation}</Text>
                  </Box>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {debugText && (
        <Code block c="dimmed" style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>{debugText}</Code>
      )}
    </Stack>
  );
}
