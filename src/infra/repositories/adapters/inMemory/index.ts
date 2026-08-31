import { Repositories } from "@/src/domain/Repositories";
import { InMemoryCityRepository } from "./inMemoryCityRepository";
import { InMemoryCategoryRepository } from "./inMemoryCategoryRepository";
import { inMemoryAuthRepository } from "./inMemoryAuthRepository";

export const InMemoryRepository: Repositories = {
  auth: new inMemoryAuthRepository(),
  city: new InMemoryCityRepository(),
  category: new InMemoryCategoryRepository(),
}