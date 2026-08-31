import { Repositories } from "@/src/domain/Repositories";
import { SupabaseCityRepository } from "./SupabaseCityRepository";
import { SupabaseCategoryRepository } from "./SupabaseCategoryRepository";
import { inMemoryAuthRepository } from "../inMemory/inMemoryAuthRepository";


export const SupabaseRepositories: Repositories = {
  auth: new inMemoryAuthRepository(), //TODO: replace with supabase auth implementation
  city: SupabaseCityRepository,
  category: SupabaseCategoryRepository,
};