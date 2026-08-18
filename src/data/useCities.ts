import { useEffect, useState } from "react";
import { CityPreview } from "../types";
import { supabaseService } from "../supabase/supabaseService";

type CityFilter = {
  name?: string;
  categoryId?: string | null;
};

type UseCitiesReturn = {
  cities?: CityPreview[]
  isLoading: boolean;
  error: unknown
}

export function useCities({ name, categoryId }: CityFilter): UseCitiesReturn {
  const [cities, setCities] = useState<CityPreview[]>()
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<null | unknown>(null)

  async function fetchData() {
    try {
      setIsLoading(true)
      const cities = await supabaseService.findAll()
      console.log(cities[0].coverImage);

      setCities(cities)
    } catch (error) {
      setError(error)
    } finally {
      setIsLoading(false)
    }

  }

  useEffect(() => {
    fetchData();

  }, [])


  return { cities, isLoading, error };
}



// let cityPreviewList = [...cities];

//   if (name) {
//     cityPreviewList = cityPreviewList.filter((city) => {
//       return city.name.toLowerCase().includes(name.toLowerCase());
//     });
//   }

//   if (categoryId) {
//     cityPreviewList = cityPreviewList.filter((city) => {
//       return city.categories.some((category) => category.id === categoryId);
//     });
//   }