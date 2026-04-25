import { Container, Title, Text, Button } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Container size={400} pt={80} ta="center">
      <Title order={1} mb="md">404</Title>
      <Text mb="lg">Seite nicht gefunden</Text>
      <Button variant="light" onClick={() => void navigate('/')}>
        Zur Startseite
      </Button>
    </Container>
  );
}
