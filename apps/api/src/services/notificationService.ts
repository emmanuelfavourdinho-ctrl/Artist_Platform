import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  /** App-relative path the notification opens, e.g. /studio/verification/<id>. */
  link?: string;
  /** Extra identifiers (never secrets or submitted content). */
  data?: Record<string, string | number>;
}

const APP_ORIGIN = 'https://artist-platform.invalid';

function hasControlChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}

// Only normalized same-origin app paths are stored or returned to clients.
export function isSafeLink(link: string): boolean {
  if (
    typeof link !== 'string' ||
    link.length === 0 ||
    !link.startsWith('/') ||
    link.startsWith('//') ||
    link.includes('\\') ||
    hasControlChars(link) ||
    /%(?![0-9a-f]{2})/i.test(link)
  ) {
    return false;
  }

  try {
    // Separate the pathname from its optional query string or fragment.
    const rawPath = link.split(/[?#]/, 1)[0] ?? '';

    // Reject encoded path separators to avoid ambiguous path interpretation.
    if (/%(?:2f|5c)/i.test(rawPath)) {
      return false;
    }

    const decodedPath = decodeURIComponent(rawPath);

    if (
      decodedPath.includes('\\') ||
      hasControlChars(decodedPath) ||
      /%(?:2f|5c)/i.test(decodedPath)
    ) {
      return false;
    }

    const destination = new URL(link, APP_ORIGIN);

    // The normalized URL must stay on the trusted origin, and URL parsing
    // must not have changed the pathname.
    return destination.origin === APP_ORIGIN && destination.pathname === rawPath;
  } catch {
    return false;
  }
}

/*
  Explainer: creates a persistent notification using the caller's
  database client. Pass the transaction client from the operation that
  caused it, and the notification commits or rolls back with that
  operation — there can never be a "more information needed" notification
  for a request that failed to save. The link is stored at data.link.
*/
export function createNotification(db: Db, input: NewNotification) {
  if (input.link !== undefined && !isSafeLink(input.link)) {
    throw new Error('Notification link must be an app-relative path');
  }
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: { ...(input.data ?? {}), ...(input.link ? { link: input.link } : {}) },
    },
  });
}
