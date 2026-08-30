
import { useAppQuery } from "@/src/infra/operations/useAppQuery";
import { CityFindAllFilters } from "../ICityRepository";
import { useRepository } from "@/src/infra/repositories/RepositoryProvider";

export function useCityFindAll(
  filters: CityFindAllFilters,
) {
  const { city } = useRepository()
  return useAppQuery(
    () => city.findAll(filters),
    [filters.name, filters.categoryId]
  );
}