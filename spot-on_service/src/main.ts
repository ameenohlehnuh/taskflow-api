import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import dataSource from './database/data-source';

async function bootstrap() {
  if (process.env.RUN_MIGRATIONS === 'true') {
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
    console.log('Database migrations completed.');
  }

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on port: ${port}`);
}
bootstrap();