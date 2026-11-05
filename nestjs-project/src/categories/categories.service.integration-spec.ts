import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTestDataSource } from '../test/create-test-data-source';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

const SEEDED_SLUGS = [
  'educacao',
  'entretenimento',
  'esportes',
  'humor',
  'jogos',
  'musica',
  'noticias',
  'outros',
  'tecnologia',
  'viagens',
];

describe('CategoriesService (integration)', () => {
  let module: TestingModule;
  let service: CategoriesService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          createTestDataSource([
            User,
            Channel,
            RefreshToken,
            VerificationToken,
            Video,
            Category,
          ]).options,
        ),
        TypeOrmModule.forFeature([Category]),
      ],
      providers: [CategoriesService],
    }).compile();
    service = module.get(CategoriesService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('findAll', () => {
    it('should return the seeded catalog ordered by name', async () => {
      const categories = await service.findAll();

      expect(categories.map((c) => c.slug).sort()).toEqual(SEEDED_SLUGS);
      const names = categories.map((c) => c.name);
      expect(names).toEqual(
        [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    });
  });

  describe('findBySlug', () => {
    it('should return the category for a known slug', async () => {
      const category = await service.findBySlug('jogos');

      expect(category).toMatchObject({ slug: 'jogos', name: 'Jogos' });
    });

    it('should return null for an unknown slug', async () => {
      await expect(service.findBySlug('inexistente')).resolves.toBeNull();
    });
  });
});
