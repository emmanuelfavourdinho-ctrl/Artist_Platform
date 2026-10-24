import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    loading: false,
    firebaseUser: { getIdToken: vi.fn().mockResolvedValue('test-token') },
  }),
}));

import ReportIssueForm from './ReportIssueForm';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('report issue intake', () => {
  it('submits a contextual report and confirms success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) }),
    );
    render(
      <ReportIssueForm targetType="ARTWORK" targetSlug="blue-study" targetName="Blue Study" />,
    );
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Copied artwork' } });
    fireEvent.change(screen.getByLabelText('Additional details (optional)'), {
      target: { value: 'The posted image belongs to another artist.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByText('Your report has been sent to the moderation team.'),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reports'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          targetType: 'ARTWORK',
          targetSlug: 'blue-study',
          reason: 'Copied artwork',
          description: 'The posted image belongs to another artist.',
        }),
      }),
    );
  });

  it('displays network and API failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')));
    render(<ReportIssueForm targetType="USER" targetSlug="artist-one" targetName="Artist One" />);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Fake identity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
