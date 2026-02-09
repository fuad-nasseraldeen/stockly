import { describe, it, expect, vi, beforeEach } from 'vitest';
import Products from '../../../src/pages/Products';
import { render, screen, fireEvent, waitFor } from '../../utils/test-utils';
import { useProducts } from '../../../src/hooks/useProducts';
import { useSuppliers } from '../../../src/hooks/useSuppliers';
import { useCategories } from '../../../src/hooks/useCategories';
import { useSettings } from '../../../src/hooks/useSettings';
import { mockProductsResponse, mockSupplier, mockCategory } from '../../fixtures';

vi.mock('../../../src/hooks/useProducts', () => ({
  useProducts: vi.fn(),
  useDeleteProduct: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useProductPriceHistory: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('../../../src/hooks/useSuppliers', () => ({
  useSuppliers: vi.fn(),
}));

vi.mock('../../../src/hooks/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('../../../src/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('../../../src/lib/pdf-service', () => ({
  downloadTablePdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/pdf-price-table', () => ({
  getPriceTableExportLayout: vi.fn().mockResolvedValue({
    columns: [],
  }),
  priceRowToExportValues: vi.fn().mockReturnValue([]),
}));

describe('Products Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProducts as any).mockReturnValue({
      data: mockProductsResponse,
      isLoading: false,
    });
    (useSuppliers as any).mockReturnValue({
      data: [mockSupplier],
    });
    (useCategories as any).mockReturnValue({
      data: [mockCategory],
    });
    (useSettings as any).mockReturnValue({
      data: {
        vat_percent: 18,
        use_vat: true,
        use_margin: true,
        global_margin_percent: 30,
      },
    });
  });

  it('renders products list with search and filters', () => {
    render(<Products />);

    expect(screen.getByText('מוצרים')).toBeInTheDocument();
    expect(screen.getByText(/סה״כ 1 מוצרים/)).toBeInTheDocument();
    // Product card
    expect(screen.getByText(mockProductsResponse.products[0].name)).toBeInTheDocument();

    // Search input
    const searchInput = screen.getByPlaceholderText(/חיפוש לפי שם מוצר או מק"ט/i);
    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(searchInput).toHaveValue('Test');
  });

  it('shows empty state when there are no products', () => {
    (useProducts as any).mockReturnValue({
      data: { products: [], total: 0, page: 1, totalPages: 1 },
      isLoading: false,
    });

    render(<Products />);

    expect(screen.getByText('לא נמצאו מוצרים')).toBeInTheDocument();
    expect(screen.getByText('הוסף מוצר ראשון')).toBeInTheDocument();
  });
});

