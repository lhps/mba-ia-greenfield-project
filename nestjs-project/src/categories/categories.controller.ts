import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryListResponseDto } from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List video categories',
    description:
      'Returns the fixed catalog of video categories ordered by name. The slug is the identifier used when editing a video.',
  })
  @ApiResponse({
    status: 200,
    description: 'Category catalog',
    type: CategoryListResponseDto,
  })
  async findAll(): Promise<CategoryListResponseDto> {
    const categories = await this.categories.findAll();
    return {
      items: categories.map(({ slug, name }) => ({ slug, name })),
    };
  }
}
