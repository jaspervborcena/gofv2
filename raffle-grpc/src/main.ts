import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const httpApp = await NestFactory.create(AppModule);
  httpApp.enableCors();
  const httpPort = Number(process.env.PORT || process.env.HTTP_PORT || 3001);
  await httpApp.listen(httpPort, '0.0.0.0');
  console.log(`NestJS API listening on http://0.0.0.0:${httpPort}`);
}

void bootstrap();
