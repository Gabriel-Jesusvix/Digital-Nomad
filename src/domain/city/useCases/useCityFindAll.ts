
import { useFetchData } from "@/src/data/useFetchData";
import { CityFindAllFilters, ICityRepository } from "../ICityRepository";

export function useCityFindAll(
  filters: CityFindAllFilters,
  repository: ICityRepository
) {
  return useFetchData(
    () => repository.findAll(filters),
    [filters.name, filters.categoryId]
  );
}