import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.categories.findOne({ where: { slug } });
  }
}
