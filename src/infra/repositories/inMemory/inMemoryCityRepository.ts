import { cities } from "@/src/data/cities";
import { City, CityPreview } from "@/src/domain/city/City";
import { CityFindAllFilters, ICityRepository } from "@/src/domain/city/ICityRepository";


export class inMemoryCityRepository implements ICityRepository {
  findById(id: string): Promise<City> {
    throw new Error("Method not implemented.");
  }
  getRelatedCities(cityId: string): Promise<CityPreview[]> {
    throw new Error("Method not implemented.");
  }

  async findAll(filters: CityFindAllFilters): Promise<CityPreview[]> {
    return cities
  }
}