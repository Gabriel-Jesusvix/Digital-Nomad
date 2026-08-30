import { Category, CategoryCode } from "@/src/domain/category/Category";
import { supabase } from "./supabase";
import { ICategoryRepository } from "@/src/domain/category/ICategoryRepository";

async function findAll(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*");
  if (error) {
    throw new Error("error trying to list categories");
  }

  return data.map((row) => ({
    id: row.id,
    description: row.description,
    name: row.name,
    code: row.code as CategoryCode,
  }));
}

export const SupabaseCategoryRepository: ICategoryRepository = {
  findAll,
};