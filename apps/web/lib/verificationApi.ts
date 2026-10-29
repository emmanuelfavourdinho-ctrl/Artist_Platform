import { adminRequest, type Pagination } from './adminApi';

// ---------------------------------------------------------------------------
// Types shared by the staff review screens and the artist's task screens.
// ---------------------------------------------------------------------------

export * from './verificationTypes';
import type {
  ArtistRequest,
  NewRequestField,
  OwnVerification,
  QueueRow,
  ReviewDetail,
  SubmittedResponse,
  RequestStatus,
} from './verificationTypes';

// --- staff ----------------------------------------------------------------

export const fetchVerificationQueue = (params: { page?: number; search?: string; state?: string }) =>
  adminRequest<QueueRow[]>('GET', '/admin/artist-verification', { query: { ...params, pageSize: 20 } }) as Promise<{
    data: QueueRow[];
    pagination?: Pagination;
  }>;

export const fetchReviewDetail = (artistId: string) =>
  adminRequest<ReviewDetail>('GET', `/admin/artist-verification/${artistId}`).then((r) => r.data);

export const createInfoRequest = (
  artistId: string,
  body: { message?: string; fields: NewRequestField[] },
) => adminRequest<{ id: string; round: number }>('POST', `/admin/artist-verification/${artistId}/requests`, { body });

export const cancelInfoRequest = (requestId: string, reason: string) =>
  adminRequest<{ id: string }>('POST', `/admin/artist-verification/requests/${requestId}/cancel`, {
    body: { reason },
  });

export const decideVerification = (
  artistId: string,
  body: { decision: 'APPROVE' | 'REJECT'; reason?: string },
) => adminRequest<{ verificationStatus: string }>('POST', `/admin/artist-verification/${artistId}/decision`, { body });

// --- artist ---------------------------------------------------------------

export const fetchOwnVerification = () =>
  adminRequest<OwnVerification>('GET', '/studio/verification').then((r) => r.data);

export const fetchOwnRequest = (id: string) =>
  adminRequest<ArtistRequest>('GET', `/studio/verification/requests/${id}`).then((r) => r.data);

export const submitOwnResponse = (id: string, responses: SubmittedResponse[]) =>
  adminRequest<{ status: RequestStatus }>('POST', `/studio/verification/requests/${id}/submission`, {
    body: { responses },
  });
