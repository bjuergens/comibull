import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '../pages/NotFoundPage';

describe('NotFoundPage', () => {
  it('renders 404 message', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText(/seite nicht gefunden/i)).toBeInTheDocument();
  });
});
