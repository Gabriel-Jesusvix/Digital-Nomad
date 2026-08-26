import { City, CityPreview } from "./City";

export type CityFindAllFilters = {
  name?: string;
  categoryId?: string | null;
};


export interface ICityRepository {
  findAll(filters: CityFindAllFilters): Promise<CityPreview[]>;
  findById(id: string): Promise<City>;
  getRelatedCities(cityId: string): Promise<CityPreview[]>;
}