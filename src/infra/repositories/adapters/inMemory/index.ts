import { Repositories } from "@/src/domain/Repositories";
import { InMemoryCityRepository } from "./inMemoryCityRepository";

export const InMemoryRepository: Repositories = {
  city: new InMemoryCityRepository()
}