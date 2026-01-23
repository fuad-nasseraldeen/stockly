import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../lib/api';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
