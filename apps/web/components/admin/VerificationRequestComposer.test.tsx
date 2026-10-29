import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VerificationRequestComposer } from './VerificationRequestComposer';

function setup(props: Partial<React.ComponentProps<typeof VerificationRequestComposer>> = {}) {
  const onSubmit = vi.fn();
  render(<VerificationRequestComposer onSubmit={onSubmit} onCancel={() => {}} {...props} />);
  return { onSubmit };
}

describe('VerificationRequestComposer', () => {
  it('offers only the approved catalogue — a portfolio link and additional details, no uploads', () => {
    setup();
    const boxes = screen.getAllByRole('checkbox').map((b) => b.closest('label')?.textContent ?? '');
    expect(boxes).toHaveLength(2);
    expect(boxes.join(' ')).toMatch(/Portfolio link/);
    expect(boxes.join(' ')).toMatch(/Additional details/);
    expect(screen.queryByText(/upload/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('cannot proceed with nothing selected, or a selected field without instructions', () => {
    setup();
    const review = screen.getByText('Review request') as HTMLButtonElement;
    expect(review.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Portfolio link/));
    expect(review.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'Link to your portfolio' } });
    expect(review.disabled).toBe(false);
  });

  it('shows a confirmation summary first and sends nothing until confirmed', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByLabelText(/Portfolio link/));
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: '  Link to your portfolio  ' } });
    fireEvent.click(screen.getByLabelText('Required')); // make it optional
    fireEvent.change(screen.getByLabelText(/Message to the artist/), { target: { value: 'Thanks for applying' } });

    fireEvent.click(screen.getByText('Review request'));
    expect(onSubmit).not.toHaveBeenCalled();

    const summary = within(screen.getByRole('list', { name: 'Requested information' }));
    expect(summary.getByText(/Portfolio link/)).toBeTruthy();
    expect(summary.getByText(/optional/)).toBeTruthy();
    expect(screen.getByText(/does not verify or reject/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Send request'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      message: 'Thanks for applying',
      fields: [{ type: 'PORTFOLIO_URL', label: undefined, instructions: 'Link to your portfolio', required: false }],
    });
  });

  it('sends a custom label and keeps required fields required by default', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByLabelText(/Additional details/));
    fireEvent.change(screen.getByPlaceholderText('Additional details'), { target: { value: 'About your process' } });
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'Describe how you work' } });
    fireEvent.click(screen.getByText('Review request'));
    fireEvent.click(screen.getByText('Send request'));
    expect(onSubmit).toHaveBeenCalledWith({
      message: undefined,
      fields: [{ type: 'ADDITIONAL_DETAILS', label: 'About your process', instructions: 'Describe how you work', required: true }],
    });
  });

  it('lets the reviewer go back, and shows server errors and a busy state', () => {
    setup({ error: 'There is already an open request', busy: true });
    fireEvent.click(screen.getByLabelText(/Portfolio link/));
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Review request'));
    expect(screen.getByRole('alert').textContent).toMatch(/already an open request/);
    expect((screen.getByText('Sending…') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Back') as HTMLButtonElement).disabled).toBe(true);
  });
});
