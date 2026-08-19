import { CityFilters, supabaseService } from "../supabase/supabaseService";
import { useFetchData } from "./useFetchData";

export function useCities(filters: CityFilters) {
  return useFetchData(
    () => supabaseService.findAll(filters),
    [filters.name, filters.categoryId]
  );
}