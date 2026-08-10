import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('renders the homepage hero content', () => {
    render(<HomePage />);

    ```
expect(screen.getByText('Artist Marketplace')).toBeInTheDocument();
expect(
  screen.getByRole('link', { name: /Explore the frontend/i }),
).toBeInTheDocument();
```;
  });
});
