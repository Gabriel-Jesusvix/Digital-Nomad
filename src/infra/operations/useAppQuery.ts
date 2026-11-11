import { useQuery } from "@tanstack/react-query";

type UseAppQueryReturn<DataT> = {
  data?: DataT;
  isLoading: boolean;
  isPending: boolean;
  error: unknown;
};
type UseAppQueryParams<DataT> = {
  queryKey: (string | null | undefined | number)[];
  fetchData: () => Promise<DataT>;
}; // Só para passar via objetos essa tipagem na linha 15;

export function useAppQuery<DataT>(
  { fetchData, queryKey }: UseAppQueryParams<DataT>
): UseAppQueryReturn<DataT> {

  const { data, isLoading, error, isPending } = useQuery({
    queryKey,
    queryFn: fetchData,
  })

  return {
    data,
    isLoading,
    error,
    isPending,
  };
}