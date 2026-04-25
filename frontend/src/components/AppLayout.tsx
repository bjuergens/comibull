import { useState } from 'react';
import { Link, Outlet, useNavigate, useOutletContext, useLocation, matchPath } from 'react-router-dom';
import { AppShell, Group, Text, Anchor, ActionIcon } from '@mantine/core';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface LayoutContext {
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
}

export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // Reader view hides the chrome behind a floating toggle to maximize page real estate.
  const isReader = matchPath('/comics/:id', location.pathname) !== null;
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [readerHeaderOpen, setReaderHeaderOpen] = useState(false);

  const ctx: LayoutContext = { setBreadcrumbs };
  const headerCollapsed = isReader && !readerHeaderOpen;

  return (
    <AppShell
      header={{ height: 50, collapsed: headerCollapsed }}
      padding="md"
    >
      {isReader && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          onClick={() => setReaderHeaderOpen(v => !v)}
          aria-label={readerHeaderOpen ? 'Kopfzeile ausblenden' : 'Kopfzeile einblenden'}
          style={{
            position: 'fixed',
            top: 4,
            right: 4,
            zIndex: 'var(--mantine-z-index-modal)',
          }}
        >
          {readerHeaderOpen ? '✕' : '☰'}
        </ActionIcon>
      )}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" style={{ overflow: 'hidden' }}>
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0, overflow: 'hidden' }}>
            <Anchor
              component={Link}
              to="/"
              fw={700}
              style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              ComiBulle
            </Anchor>
            <Text size="sm" c="dimmed">/</Text>
            <Anchor
              component={Link}
              to="/library"
              size="sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Bibliothek
            </Anchor>
            {breadcrumbs.map((item, i) => {
              const isLast = i === breadcrumbs.length - 1;
              const isLink = !isLast && item.href;
              return (
                <Group key={i} gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text size="sm" c="dimmed">/</Text>
                  {isLink ? (
                    <Anchor
                      component={Link}
                      to={item.href!}
                      size="sm"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {item.label}
                    </Anchor>
                  ) : (
                    <Text size="sm" fw={isLast ? 500 : undefined} truncate style={{ minWidth: 0 }}>
                      {item.label}
                    </Text>
                  )}
                </Group>
              );
            })}
          </Group>
          <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
            <ActionIcon
              variant="subtle"
              data-testid="settings-btn"
              onClick={() => void navigate('/settings')}
              aria-label="Einstellungen"
            >
              ⚙
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet context={ctx} />
      </AppShell.Main>
    </AppShell>
  );
}
