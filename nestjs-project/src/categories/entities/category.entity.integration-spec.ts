import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { createTestDataSource } from '../../test/create-test-data-source';
import { Category } from './category.entity';

describe('Category entity (integration)', () => {
  let dataSource: DataSource;
  let categoryRepository: Repository<Category>;

  beforeAll(async () => {
    dataSource = createTestDataSource([
      User,
      Channel,
      RefreshToken,
      VerificationToken,
      Video,
      Category,
    ]);
    await dataSource.initialize();
    categoryRepository = dataSource.getRepository(Category);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should reject a second category with an existing slug', async () => {
    // `jogos` is part of the seed applied by the CreateCategories migration.
    await expect(
      categoryRepository.insert({ slug: 'jogos', name: 'Jogos duplicado' }),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });
});
