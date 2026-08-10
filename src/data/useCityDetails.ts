import { cities } from "./cities";


export const useCityDetails = (id: string) => {
  const city = cities.find((city) => city.id === id);

  return city;
}
