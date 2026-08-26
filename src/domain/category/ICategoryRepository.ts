import { Category } from "./Category";


export interface ICategoryRepository {
  findAll(): Promise<Category[]>
}