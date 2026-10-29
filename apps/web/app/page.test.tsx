import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartProvider } from '../context/CartContext';
import { AuthProvider } from '../context/AuthContext';

vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    callback(null);
    return () => undefined;
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updateProfile: vi.fn(),
  signOut: vi.fn(),
}));

import HomePage from './page';

function renderHomePage() {
  render(<AuthProvider><CartProvider><HomePage /></CartProvider></AuthProvider>);
}

describe('HomePage', () => {
  it('renders the hero headline and primary call to action', () => {
    renderHomePage();

    expect(screen.getByText(/finds its/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore Artists/i })).toBeInTheDocument();
  });

  it('renders the featured artists section with each artist name', () => {
    renderHomePage();

    expect(screen.getByRole('heading', { name: /Meet the creators/i })).toBeInTheDocument();
    expect(screen.getByText('Angel-Faith')).toBeInTheDocument();
  });

  it('renders the final call to action', () => {
    renderHomePage();

    expect(screen.getByRole('link', { name: /Join Artist_Platform/i })).toBeInTheDocument();
  });
});
