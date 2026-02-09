import { describe, it, expect, vi, beforeEach } from 'vitest';
import Suppliers from '../../../src/pages/Suppliers';
import { render, screen, fireEvent } from '../../utils/test-utils';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../../../src/hooks/useSuppliers';
import { mockSupplier } from '../../fixtures';

vi.mock('../../../src/hooks/useSuppliers', () => ({
  useSuppliers: vi.fn(),
  useCreateSupplier: vi.fn(),
  useUpdateSupplier: vi.fn(),
  useDeleteSupplier: vi.fn(),
}));

describe('Suppliers Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useSuppliers as any).mockReturnValue({
      data: [mockSupplier],
      isLoading: false,
    });
    (useCreateSupplier as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    (useUpdateSupplier as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    (useDeleteSupplier as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
  });

  it('renders suppliers list and search', () => {
    render(<Suppliers />);

    expect(screen.getByText('ספקים')).toBeInTheDocument();
    expect(screen.getByText(mockSupplier.name)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/הקלד שם ספק/i);
    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(searchInput).toHaveValue('Test');
  });

  it('shows empty state when no suppliers', () => {
    (useSuppliers as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<Suppliers />);

    expect(screen.getByText('לא נמצאו ספקים')).toBeInTheDocument();
    expect(screen.getByText('הוסף ספק ראשון')).toBeInTheDocument();
  });
});

