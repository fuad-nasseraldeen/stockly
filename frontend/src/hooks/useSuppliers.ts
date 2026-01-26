import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suppliersApi, Supplier } from '../lib/api';

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.list(),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<Supplier, Error, Parameters<typeof suppliersApi.create>[0]>({
    mutationFn: suppliersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof suppliersApi.update>[1] }) =>
      suppliersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: suppliersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
