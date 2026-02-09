import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '../../utils/test-utils';
import App from '../../../src/App';
import { supabase } from '../../../src/lib/supabase';

// Mock supabase client
vi.mock('../../../src/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
    },
  };
});

// Mock OnboardingRouter internals to avoid tenant/network complexity – we only care that
// once user is "logged in", the inner app is rendered.
vi.mock('../../../src/components/OnboardingRouter', () => ({
  OnboardingRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock main pages used in flow
vi.mock('../../../src/pages/Products', () => ({
  __esModule: true,
  default: () => <div>מוצרים - דף ראשי</div>,
}));
vi.mock('../../../src/pages/Login', () => ({
  __esModule: true,
  default: () => <div>דף התחברות</div>,
}));
vi.mock('../../../src/pages/Signup', () => ({
  __esModule: true,
  default: () => <div>דף הרשמה</div>,
}));

describe('Splash + App authentication flow', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Default: no session (user not logged in)
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });

    // We need a mutable location for tests that redirect
    // @ts-expect-error - jsdom override
    delete (window as any).location;
    // @ts-expect-error - jsdom override
    window.location = {
      ...originalLocation,
      pathname: '/login',
    };
  });

  afterEach(() => {
    // Restore original location
    // @ts-expect-error - jsdom override
    window.location = originalLocation;
  });

  it('shows SplashScreen first for logged-out user, then auth screens after animation completes', async () => {
    vi.useFakeTimers();

    render(<App />);

    // We expect the splash content to be visible initially
    expect(screen.getByRole('status', { name: /stockly נטען/i })).toBeInTheDocument();

    // Fast‑forward splash timers (enter + exit)
    await act(async () => {
      vi.runAllTimers();
    });

    // After splash finishes and no user session exists → we should see auth shell (login)
    expect(screen.getByText('דף התחברות')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('skips SplashScreen when user session already exists and shows main app (products)', async () => {
    vi.useFakeTimers();

    // Pretend we already have a logged-in session
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
          },
        },
      },
    });

    render(<App />);

    // Fast‑forward timers – even if splash tries to run, user is present so we expect main app
    await act(async () => {
      vi.runAllTimers();
    });

    // Main app (products page inside AppWithNavigation) should be rendered
    expect(screen.getByText('מוצרים - דף ראשי')).toBeInTheDocument();

    vi.useRealTimers();
  });
}

