import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OnboardingRouter } from '../../../src/components/OnboardingRouter';
import { useTenant } from '../../../src/hooks/useTenant';
import { useSuperAdmin } from '../../../src/hooks/useSuperAdmin';
import { invitesApi } from '../../../src/lib/api';
import { mockTenant } from '../../fixtures';

// Mock hooks
vi.mock('../../../src/hooks/useTenant', () => ({
  useTenant: vi.fn(),
}));

vi.mock('../../../src/hooks/useSuperAdmin', () => ({
  useSuperAdmin: vi.fn(),
}));

vi.mock('../../../src/lib/api', () => ({
  invitesApi: {
    accept: vi.fn(),
  },
}));

describe('OnboardingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state when tenants are loading', () => {
    (useTenant as any).mockReturnValue({
      tenants: [],
      isLoading: true,
      refetchTenants: vi.fn(),
    });
    (useSuperAdmin as any).mockReturnValue({ data: false });

    render(
      <BrowserRouter>
        <OnboardingRouter>
          <div>Main App</div>
        </OnboardingRouter>
      </BrowserRouter>
    );

    // When loading and not on /onboarding route, it shows children with loader
    // The TenantLoadingBar should be present
    expect(screen.getByText('Main App')).toBeInTheDocument();
  });

  it('should show main app when user has tenants', async () => {
    (useTenant as any).mockReturnValue({
      tenants: [mockTenant],
      isLoading: false,
      refetchTenants: vi.fn(),
    });
    (useSuperAdmin as any).mockReturnValue({ data: false });

    render(
      <BrowserRouter>
        <OnboardingRouter>
          <div>Main App</div>
        </OnboardingRouter>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main App')).toBeInTheDocument();
    });
  });

  it('should show choice screen when user has no tenants', () => {
    (useTenant as any).mockReturnValue({
      tenants: [],
      isLoading: false,
      refetchTenants: vi.fn(),
    });
    (useSuperAdmin as any).mockReturnValue({ data: false });

    render(
      <BrowserRouter>
        <OnboardingRouter>
          <div>Main App</div>
        </OnboardingRouter>
      </BrowserRouter>
    );

    // Should show choice screen (implementation specific)
    expect(screen.queryByText('Main App')).not.toBeInTheDocument();
  });

  it('should allow super admin to access admin page without tenants', () => {
    (useTenant as any).mockReturnValue({
      tenants: [],
      isLoading: false,
      refetchTenants: vi.fn(),
    });
    (useSuperAdmin as any).mockReturnValue({ data: true });

    // Mock location to be /admin
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      pathname: '/admin',
    } as any);

    render(
      <BrowserRouter>
        <OnboardingRouter>
          <div>Main App</div>
        </OnboardingRouter>
      </BrowserRouter>
    );

    // Super admin should be able to access
    expect(screen.getByText('Main App')).toBeInTheDocument();
  });
});
