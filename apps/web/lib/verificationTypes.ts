// Pure types and display constants for the verification workflow.
// No network or auth imports here, so UI components (and their tests) can
// use them without initialising Firebase.

export type RequestStatus = 'AWAITING_ARTIST_INPUT' | 'AWAITING_REVIEW' | 'COMPLETED' | 'CANCELLED';

// The field types staff may ask for. This is the DISPLAY catalogue only —
// the server holds the authoritative one and rejects anything else, so a
// tampered request cannot invent a field.
export type VerificationFieldType = 'PORTFOLIO_URL' | 'ADDITIONAL_DETAILS';

export const FIELD_CATALOGUE: Record<
  VerificationFieldType,
  { label: string; help: string; kind: 'url' | 'text' }
> = {
  PORTFOLIO_URL: {
    label: 'Portfolio link',
    help: 'An absolute HTTPS web address where the artist shows their work.',
    kind: 'url',
  },
  ADDITIONAL_DETAILS: {
    label: 'Additional details',
    help: 'A written answer to a question you ask.',
    kind: 'text',
  },
};

export interface RequestedField {
  id: VerificationFieldType;
  type: VerificationFieldType;
  label: string;
  instructions: string;
  required: boolean;
}

export interface SubmittedResponse {
  fieldId: string;
  value: string;
}

export interface NewRequestField {
  type: VerificationFieldType;
  label?: string;
  instructions: string;
  required: boolean;
}

type Person = { id: string; firstName: string; lastName: string } | null;

export interface QueueRow {
  id: string;
  displayName: string;
  location: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string };
  _count: { artworks: number; verificationRequests: number };
  openRequest: {
    id: string;
    round: number;
    status: RequestStatus;
    createdAt: string;
    submission: { submittedAt: string } | null;
  } | null;
}

export interface ReviewRound {
  id: string;
  round: number;
  status: RequestStatus;
  message: string | null;
  fields: RequestedField[];
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  requestedBy: Person;
  cancelledBy: Person;
  submission: { responses: SubmittedResponse[]; submittedAt: string; submittedBy: Person } | null;
}

export interface ReviewDetail {
  artist: {
    id: string;
    displayName: string;
    slug: string;
    biography: string | null;
    artisticStatement: string | null;
    website: string | null;
    location: string | null;
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
    verifiedAt: string | null;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string; email: string; status: string; createdAt: string };
    socialLinks: { platform: string; url: string }[];
    achievements: { id: string; title: string; organization: string | null; year: number | null }[];
    _count: { artworks: number };
  };
  requests: ReviewRound[];
  decisions: {
    id: string;
    decision: string;
    reason: string | null;
    requestId: string | null;
    createdAt: string;
    decidedBy: Person;
  }[];
}

export interface ArtistRequest {
  id: string;
  round: number;
  status: RequestStatus;
  message: string | null;
  fields: RequestedField[];
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  submission: { responses: SubmittedResponse[]; submittedAt: string } | null;
}

export interface OwnVerification {
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  activeRequest: ArtistRequest | null;
  history: ArtistRequest[];
}
