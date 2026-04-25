import { Component, type ReactNode } from 'react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Fallback UI is the user feedback — no toast. main.tsx handles non-React errors.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Title order={2}>Etwas ist schiefgelaufen</Title>
            <Text c="dimmed">Ein unerwarteter Fehler ist aufgetreten. Versuche die Seite neu zu laden.</Text>
            <Button onClick={() => window.location.reload()}>Seite neu laden</Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
