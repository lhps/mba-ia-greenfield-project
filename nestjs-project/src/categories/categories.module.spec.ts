import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTestDataSource } from '../test/create-test-data-source';
import { CategoriesModule } from './categories.module';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

describe('CategoriesModule', () => {
  it('should compile with TypeOrmModule.forFeature([Category]) and export CategoriesService', async () => {
    const module = await Test.createTestingModule({
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
        CategoriesModule,
      ],
    }).compile();

    expect(module.get(CategoriesService)).toBeInstanceOf(CategoriesService);
    await module.close();
  }, 30000);
});
