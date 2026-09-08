import { Repositories } from "@/src/domain/Repositories";
import { SupabaseCityRepository } from "./SupabaseCityRepository";
import { SupabaseCategoryRepository } from "./SupabaseCategoryRepository";
import { inMemoryAuthRepository } from "../inMemory/inMemoryAuthRepository";
import { SupabaseAuthRepository } from "./SupabaseAuthRepository";


export const SupabaseRepositories: Repositories = {
  // auth: new inMemoryAuthRepository(), //TODO: replace with supabase auth implementation
  auth: new SupabaseAuthRepository(),
  city: SupabaseCityRepository,
  category: SupabaseCategoryRepository,
};