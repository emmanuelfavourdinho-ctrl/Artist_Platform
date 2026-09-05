'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';
import { marketplaceFetch } from '../../lib/marketplaceApi';

interface Conversation {
  id: string;
  artist: { displayName: string };
  buyer: { firstName: string; lastName: string };
  commissionRequest: { title: string } | null;
  messages: { body: string; createdAt: string }[];
}
interface Message {
  id: string;
  body: string;
  sender: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

function MessagesContent() {
  const { firebaseUser, appUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser)
      void marketplaceFetch(firebaseUser, '/messages')
        .then((response) => response.json())
        .then((result) => setConversations(result.data ?? []))
        .catch(() => setError('Unable to load messages.'));
  }, [firebaseUser]);
  async function openConversation(conversation: Conversation) {
    if (!firebaseUser) return;
    setSelected(conversation);
    const response = await marketplaceFetch(firebaseUser, `/messages/${conversation.id}`);
    const result = await response.json();
    setMessages(result.data?.messages ?? []);
  }
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
                  {conversation.commissionRequest?.title ?? 'Marketplace conversation'}
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
                <p className="mt-1 text-xs text-muted">
                  {selected.commissionRequest?.title ?? 'Marketplace conversation'}
                </p>
              </div>
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
      <MessagesContent />
    </ProtectedRoute>
  );
}
