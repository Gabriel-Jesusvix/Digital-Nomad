import { ICategoryRepository } from "./category/ICategoryRepository";
import { ICityRepository } from "./city/ICityRepository";

export type Repositories = {
  city: ICityRepository;
  category: ICategoryRepository
};