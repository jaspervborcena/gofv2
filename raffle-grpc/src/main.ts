import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const httpApp = await NestFactory.create(AppModule);
  httpApp.enableCors();
  httpApp.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'raffle',
      protoPath: join(__dirname, '..', 'proto', 'raffle.proto'),
      url: process.env.GRPC_URL || '0.0.0.0:50051'
    }
  });

  await httpApp.startAllMicroservices();
  const httpPort = Number(process.env.PORT || process.env.HTTP_PORT || 3001);
  await httpApp.listen(httpPort, '0.0.0.0');
  console.log('Raffle gRPC server listening on 0.0.0.0:50051');
  console.log(`Winner publish endpoint listening on http://0.0.0.0:${httpPort}/winners`);
}

void bootstrap();
