import { useFetchData } from "../data/useFetchData";
import { supabaseService } from "../supabase/supabaseService";

export function useRelatedCities(cityId: string) {
  return useFetchData(() => supabaseService.getRelatedCities(cityId))
}