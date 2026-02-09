import { describe, it, expect, vi, beforeEach } from 'vitest';
import EditProduct from '../../../src/pages/EditProduct';
import { render, screen, fireEvent } from '../../utils/test-utils';
import { useProduct, useUpdateProduct } from '../../../src/hooks/useProducts';
import { useCategories } from '../../../src/hooks/useCategories';
import { useSuppliers, useCreateSupplier } from '../../../src/hooks/useSuppliers';
import { useSettings } from '../../../src/hooks/useSettings';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mockProduct, mockCategory, mockSupplier } from '../../fixtures';

vi.mock('../../../src/hooks/useProducts', () => ({
  useProduct: vi.fn(),
  useUpdateProduct: vi.fn(),
  useAddProductPrice: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useUpdateProductPrice: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useDeleteProductPrice: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useProductPriceHistory: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('../../../src/hooks/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('../../../src/hooks/useSuppliers', () => ({
  useSuppliers: vi.fn(),
  useCreateSupplier: vi.fn(),
}));

vi.mock('../../../src/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

describe('EditProduct Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useProduct as any).mockReturnValue({
      data: mockProduct,
      isLoading: false,
    });
    (useUpdateProduct as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    (useCategories as any).mockReturnValue({
      data: [mockCategory],
    });
    (useSuppliers as any).mockReturnValue({
      data: [mockSupplier],
    });
    (useCreateSupplier as any).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSupplier),
      isPending: false,
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

  function renderWithRoute() {
    return render(
      <MemoryRouter initialEntries={['/products/550e8400-e29b-41d4-a716-446655440006/edit']}>
        <Routes>
          <Route path="/products/:id/edit" element={<EditProduct />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders edit product form with existing values', () => {
    renderWithRoute();

    expect(screen.getByText('עריכת מוצר')).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/שם מוצר/i);
    expect(nameInput).toHaveValue(mockProduct.name);

    const skuInput = screen.getByLabelText(/מק"ת \/ ברקוד/i);
    expect(skuInput).toHaveValue(mockProduct.sku);
  });

  it('allows updating product name field', () => {
    renderWithRoute();

    const nameInput = screen.getByLabelText(/שם מוצר/i);
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(nameInput).toHaveValue('New Name');
  });
});

