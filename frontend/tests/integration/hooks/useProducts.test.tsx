import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProducts } from '../../../src/hooks/useProducts';
import { productsApi } from '../../../src/lib/api';
import { mockProductsResponse } from '../../fixtures';

// Mock the API
vi.mock('../../../src/lib/api', () => ({
  productsApi: {
    list: vi.fn(),
  },
}));

describe('useProducts hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should fetch products successfully', async () => {
    (productsApi.list as any).mockResolvedValue(mockProductsResponse);

    const { result } = renderHook(() => useProducts({}), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockProductsResponse);
    expect(productsApi.list).toHaveBeenCalledWith({});
  });

  it('should pass search parameter', async () => {
    (productsApi.list as any).mockResolvedValue(mockProductsResponse);

    const { result } = renderHook(() => useProducts({ search: 'test' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(productsApi.list).toHaveBeenCalledWith({ search: 'test' });
  });

  it('should pass filter parameters', async () => {
    (productsApi.list as any).mockResolvedValue(mockProductsResponse);

    const { result } = renderHook(
      () => useProducts({ supplier_id: '550e8400-e29b-41d4-a716-446655440005', category_id: '550e8400-e29b-41d4-a716-446655440004' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(productsApi.list).toHaveBeenCalledWith({
      supplier_id: '550e8400-e29b-41d4-a716-446655440005',
      category_id: '550e8400-e29b-41d4-a716-446655440004',
    });
  });

  it('should handle errors', async () => {
    const error = new Error('API Error');
    (productsApi.list as any).mockRejectedValue(error);

    const { result } = renderHook(() => useProducts({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(error);
  });
});
