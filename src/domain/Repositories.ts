import { IAuthRepository } from "./Auth/IAuthRepository";
import { ICategoryRepository } from "./category/ICategoryRepository";
import { ICityRepository } from "./city/ICityRepository";

export type Repositories = {
  auth: IAuthRepository;
  city: ICityRepository;
  category: ICategoryRepository
};