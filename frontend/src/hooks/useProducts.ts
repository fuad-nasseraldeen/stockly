import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../lib/api';

export function useProducts(params?: { 
  search?: string; 
  supplier_id?: string; 
  category_id?: string; 
  sort?: 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => productsApi.list(params),
  });
}

export function useProduct(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id),
    enabled: options?.enabled !== false && !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof productsApi.update>[1] }) =>
      productsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['product', id] });
      await queryClient.cancelQueries({ queryKey: ['products'] });

      // Snapshot the previous values
      const previousProduct = queryClient.getQueryData(['product', id]);
      const previousProductsList = queryClient.getQueryData(['products']);

      // Optimistically update the product in cache
      queryClient.setQueryData(['product', id], (old: any) => {
        if (!old) return old;
        const updated = {
          ...old,
          name: data.name ?? old.name,
          unit: data.unit ?? old.unit,
          sku: data.sku ?? old.sku,
          category_id: data.category_id ?? old.category_id,
        };
        // Update category if category_id changed
        if (data.category_id !== undefined) {
          if (data.category_id) {
            // Try to find category from products list or keep existing
            updated.category = old.category || null;
          } else {
            updated.category = null;
          }
        }
        return updated;
      });

      // Optimistically update in products list
      queryClient.setQueryData(['products'], (old: any) => {
        if (!old?.products) return old;
        return {
          ...old,
          products: old.products.map((p: any) =>
            p.id === id
              ? {
                  ...p,
                  name: data.name ?? p.name,
                  unit: data.unit ?? p.unit,
                  sku: data.sku ?? p.sku,
                  category_id: data.category_id ?? p.category_id,
                }
              : p
          ),
        };
      });

      // Return context for rollback
      return { previousProduct, previousProductsList };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousProduct) {
        queryClient.setQueryData(['product', variables.id], context.previousProduct);
      }
      if (context?.previousProductsList) {
        queryClient.setQueryData(['products'], context.previousProductsList);
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate to refetch and ensure consistency (runs in background)
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useAddProductPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof productsApi.addPrice>[1] }) =>
      productsApi.addPrice(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['priceHistory', variables.id] });
    },
  });
}

export function useUpdateProductPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priceId, data }: { id: string; priceId: string; data: Parameters<typeof productsApi.updatePrice>[2] }) =>
      productsApi.updatePrice(id, priceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['priceHistory', variables.id] });
    },
  });
}

export function useDeleteProductPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, supplierId }: { id: string; supplierId: string }) =>
      productsApi.deletePrice(id, supplierId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['priceHistory', variables.id] });
    },
  });
}

export function useProductPriceHistory(id: string, supplier_id?: string) {
  return useQuery({
    queryKey: ['priceHistory', id, supplier_id],
    queryFn: () => productsApi.getPriceHistory(id, supplier_id),
    enabled: !!id,
  });
}
