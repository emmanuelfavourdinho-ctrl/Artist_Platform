import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('renders the hero headline and primary call to action', () => {
    render(<HomePage />);

    expect(screen.getByText(/finds its/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore Artists/i })).toBeInTheDocument();
  });

  it('renders the featured artists section with each artist name', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: /Meet the creators/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Amara Osei')).toBeInTheDocument();
  });

  it('renders the final call to action', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: /Join Artist_Platform/i })).toBeInTheDocument();
  });
});
