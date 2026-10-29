import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminDialog } from './AdminDialog';
import { Pagination, StatusPill } from './AdminUi';

describe('AdminDialog', () => {
  it('is an accessible modal that focuses its first control', () => {
    render(
      <AdminDialog title="Suspend Jane" onClose={() => {}}>
        <textarea aria-label="Reason" />
        <button type="button">Confirm</button>
      </AdminDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Suspend Jane' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
  });

  it('closes on Escape, but not while a request is in flight', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <AdminDialog title="T" onClose={onClose}>
        <button type="button">ok</button>
      </AdminDialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <AdminDialog title="T" onClose={onClose} busy>
        <button type="button">ok</button>
      </AdminDialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab focus inside the dialog', () => {
    render(
      <AdminDialog title="T" onClose={() => {}}>
        <button type="button">first</button>
        <button type="button">last</button>
      </AdminDialog>,
    );
    const last = screen.getByText('last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });
});

describe('Pagination', () => {
  it('disables Previous on the first page and Next on the last', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Pagination page={1} totalPages={3} total={55} onChange={onChange} />);
    expect((screen.getByText('Previous') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Next'));
    expect(onChange).toHaveBeenCalledWith(2);

    rerender(<Pagination page={3} totalPages={3} total={55} onChange={onChange} />);
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows only the total when there is a single page', () => {
    render(<Pagination page={1} totalPages={1} total={4} onChange={() => {}} />);
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.getByText('4 total')).toBeTruthy();
  });
});

describe('StatusPill', () => {
  it('always shows the status as text, never colour alone', () => {
    render(<StatusPill status="PENDING_VERIFICATION" />);
    expect(screen.getByText('pending verification')).toBeTruthy();
  });
});
