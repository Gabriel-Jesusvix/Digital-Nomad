import { categories } from "@/src/data/categories";
import { Category } from "@/src/domain/category/Category";
import { ICategoryRepository } from "@/src/domain/category/ICategoryRepository";

export class InMemoryCategoryRepository implements ICategoryRepository {
  async findAll(): Promise<Category[]> {
    return categories;
  }
}