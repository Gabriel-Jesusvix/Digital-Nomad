
import { useFetchData } from "@/src/data/useFetchData";
import { CityFindAllFilters } from "../ICityRepository";
import { useRepository } from "@/src/infra/repositories/RepositoryProvider";

export function useCityFindAll(
  filters: CityFindAllFilters,
) {
  const { city } = useRepository()
  return useFetchData(
    () => city.findAll(filters),
    [filters.name, filters.categoryId]
  );
}