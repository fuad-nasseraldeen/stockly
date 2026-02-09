import { describe, it, expect, vi, beforeEach, fireEvent, screen } from 'vitest';
import Categories from '../../../src/pages/Categories';
import { render } from '../../utils/test-utils';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../../../src/hooks/useCategories';
import { mockCategory } from '../../fixtures';

vi.mock('../../../src/hooks/useCategories', () => ({
  useCategories: vi.fn(),
  useCreateCategory: vi.fn(),
  useUpdateCategory: vi.fn(),
  useDeleteCategory: vi.fn(),
}));

describe('Categories Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useCategories as any).mockReturnValue({
      data: [mockCategory],
      isLoading: false,
    });
    (useCreateCategory as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    (useUpdateCategory as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    (useDeleteCategory as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
  });

  it('renders categories list and search', () => {
    render(<Categories />);

    expect(screen.getByText('קטגוריות')).toBeInTheDocument();
    expect(screen.getByText(mockCategory.name)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/הקלד שם קטגוריה/i);
    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(searchInput).toHaveValue('Test');
  });

  it('shows empty state when no categories', () => {
    (useCategories as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<Categories />);

    expect(screen.getByText('לא נמצאו קטגוריות')).toBeInTheDocument();
    expect(screen.getByText('הוסף קטגוריה ראשונה')).toBeInTheDocument();
  });
});

