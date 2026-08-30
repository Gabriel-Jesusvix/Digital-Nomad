import { Repositories } from "@/src/domain/Repositories";
import { InMemoryCityRepository } from "./inMemoryCityRepository";
import { InMemoryCategoryRepository } from "./inMemoryCategoryRepository";

export const InMemoryRepository: Repositories = {
  city: new InMemoryCityRepository(),
  category: new InMemoryCategoryRepository(),
}