import { Repositories } from "@/src/domain/Repositories";
import { SupabaseCityRepository } from "./SupabaseCityRepository";
import { SupabaseCategoryRepository } from "./SupabaseCategoryRepository";


export const SupabaseRepositories: Repositories = {
  city: SupabaseCityRepository,
  category: SupabaseCategoryRepository,
};