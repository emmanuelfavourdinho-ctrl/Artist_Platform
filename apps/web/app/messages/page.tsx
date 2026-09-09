'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { marketplaceFetch } from '../../lib/marketplaceApi';
import { getCommissionStatusMeta } from '../../lib/commissionStatus';

interface Conversation {
  id: string;
  artist: { displayName: string; slug: string };
  buyer: { firstName: string; lastName: string };
  commissionRequest: { id: string; title: string; status: string } | null;
  artwork: { id: string; title: string; slug: string } | null;
  order: { id: string; orderNumber: string; status: string } | null;
  messages: { body: string; createdAt: string }[];
}
interface Message {
  id: string;
  body: string;
  sender: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

// Names what a conversation is about, always — the requirement from
// Document 2 §7 that communication should never feel like it started
// from nowhere. Commission context takes priority (it's the primary
// entry point per the product decision), then artwork, then order;
// falls back to a neutral label rather than leaving the space blank.
function ConversationContextBanner({ conversation }: { conversation: Conversation }) {
  if (conversation.commissionRequest) {
    const { label, tone } = getCommissionStatusMeta(conversation.commissionRequest.status);
    return (
      <div className="border-b border-border/10 bg-surface px-5 py-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Commission</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground">{conversation.commissionRequest.title}</p>
          <StatusBadge tone={tone} label={label} />
        </div>
      </div>
    );
  }

  if (conversation.artwork) {
    return (
      <div className="border-b border-border/10 bg-surface px-5 py-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">About this artwork</p>
        <p className="mt-1.5 text-sm text-foreground">{conversation.artwork.title}</p>
      </div>
    );
  }

  if (conversation.order) {
    return (
      <div className="border-b border-border/10 bg-surface px-5 py-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">About this order</p>
        <p className="mt-1.5 text-sm text-foreground">Order #{conversation.order.orderNumber}</p>
      </div>
    );
  }

  return (
    <div className="border-b border-border/10 bg-surface px-5 py-3">
      <p className="text-sm text-muted">General conversation</p>
    </div>
  );
}

function ConversationSubtitle({ conversation }: { conversation: Conversation }) {
  if (conversation.commissionRequest) return <>{conversation.commissionRequest.title}</>;
  if (conversation.artwork) return <>{conversation.artwork.title}</>;
  if (conversation.order) return <>Order #{conversation.order.orderNumber}</>;
  return <>Marketplace conversation</>;
}

function MessagesContent() {
  const { firebaseUser, appUser } = useAuth();
  const conversationIdParam = useSearchParams().get('conversationId');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  useEffect(() => {
    if (firebaseUser)
      void marketplaceFetch(firebaseUser, '/messages')
        .then((response) => response.json())
        .then((result) => setConversations(result.data ?? []))
        .catch(() => setError('Unable to load messages.'))
        .finally(() => setListLoaded(true));
  }, [firebaseUser]);

  async function openConversation(conversation: Conversation) {
    if (!firebaseUser) return;
    setSelected(conversation);
    const response = await marketplaceFetch(firebaseUser, `/messages/${conversation.id}`);
    const result = await response.json();
    setMessages(result.data?.messages ?? []);
  }

  // Deep-link support for "Continue Discussion" (studio commission review)
  // and any future entry point that already knows which conversation it
  // wants: once the list has loaded, open the matching thread. If the
  // conversation isn't in the freshly-loaded list — for example a brand
  // new one created a moment ago — fetch it directly by id instead of
  // silently doing nothing, since GET /messages/:id already enforces the
  // caller is a participant.
  useEffect(() => {
    if (!listLoaded || !conversationIdParam || !firebaseUser || selected) return;
    const match = conversations.find((c) => c.id === conversationIdParam);
    if (match) {
      void openConversation(match);
      return;
    }
    marketplaceFetch(firebaseUser, `/messages/${conversationIdParam}`)
      .then((response) => {
        if (!response.ok) throw new Error('not found');
        return response.json();
      })
      .then((result) => {
        setSelected(result.data);
        setMessages(result.data?.messages ?? []);
      })
      .catch(() => setError('That conversation could not be found.'));
  }, [listLoaded, conversationIdParam, firebaseUser, conversations]);

  async function send() {
    if (!firebaseUser || !selected || !body.trim()) return;
    const response = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      setError('Message could not be sent.');
      return;
    }
    const result = await response.json();
    setMessages((current) => [...current, result.data]);
    setBody('');
  }

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Messages</p>
      <h1 className="mt-3 font-display text-5xl text-foreground">Conversations with context.</h1>
      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      <div className="mt-12 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="border border-border/10">
          {conversations.length === 0 ? (
            <p className="p-6 text-sm text-muted">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void openConversation(conversation)}
                className="block w-full border-b border-border/10 p-5 text-left hover:bg-surface"
              >
                <p className="text-sm text-foreground">{conversation.artist.displayName}</p>
                <p className="mt-1 text-xs text-muted">
                  <ConversationSubtitle conversation={conversation} />
                </p>
                <p className="mt-2 truncate text-xs text-muted">
                  {conversation.messages[0]?.body ?? 'No messages yet'}
                </p>
              </button>
            ))
          )}
        </aside>
        <section className="flex min-h-[420px] flex-col border border-border/10">
          {!selected ? (
            <p className="m-auto text-sm text-muted">
              Select a conversation to read and send messages.
            </p>
          ) : (
            <>
              <div className="border-b border-border/10 p-5">
                <h2 className="font-display text-2xl text-foreground">
                  {selected.artist.displayName}
                </h2>
              </div>
              <ConversationContextBanner conversation={selected} />
              <div className="flex-1 space-y-4 p-5">
                {messages.map((message) => (
                  <p
                    key={message.id}
                    className={`max-w-[80%] rounded-lg p-3 text-sm ${message.sender.id === appUser?.id ? 'ml-auto bg-accent text-accent-foreground' : 'bg-surface text-foreground'}`}
                  >
                    {message.body}
                  </p>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex gap-3 border-t border-border/10 p-5"
              >
                <input
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write a message"
                  className="min-w-0 flex-1 border border-border/20 bg-transparent px-4 py-3 text-sm text-foreground"
                />
                <button
                  type="submit"
                  className="bg-accent px-5 py-3 text-sm text-accent-foreground"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MessagesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <MessagesContent />
      </Suspense>
    </ProtectedRoute>
  );
}
