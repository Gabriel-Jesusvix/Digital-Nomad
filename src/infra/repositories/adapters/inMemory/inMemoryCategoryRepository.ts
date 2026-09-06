import { Category } from "@/src/domain/category/Category";
import { ICategoryRepository } from "@/src/domain/category/ICategoryRepository";
import { categories } from "./data/categories";

export class InMemoryCategoryRepository implements ICategoryRepository {
  async findAll(): Promise<Category[]> {
    return categories;
  }
}