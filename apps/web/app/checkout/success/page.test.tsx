import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CheckoutSuccessPage from './page';

describe('CheckoutSuccessPage', () => {
  it('shows a confirming state instead of treating the redirect as payment proof', () => {
    render(<CheckoutSuccessPage />);

    expect(screen.getByText('Confirming payment')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your checkout is being confirmed' })).toBeInTheDocument();
    expect(screen.getByText(/waiting for the payment confirmation/i)).toBeInTheDocument();
  });
});
