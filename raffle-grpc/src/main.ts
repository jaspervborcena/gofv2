import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const grpcUrl = `0.0.0.0:${process.env.PORT || 50051}`;
  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: 'raffle',
      protoPath: join(__dirname, '..', 'proto', 'raffle.proto'),
      url: grpcUrl
    }
  };

  if (process.env.GRPC_ONLY === 'true') {
    const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, grpcOptions);
    await grpcApp.listen();
    console.log(`Native gRPC server listening on ${grpcUrl}`);
    return;
  }

  const httpApp = await NestFactory.create(AppModule);
  httpApp.enableCors();
  httpApp.connectMicroservice<MicroserviceOptions>(grpcOptions);

  await httpApp.startAllMicroservices();
  const httpPort = Number(process.env.PORT || process.env.HTTP_PORT || 3001);
  await httpApp.listen(httpPort, '0.0.0.0');
  console.log('Raffle gRPC server listening on 0.0.0.0:50051');
  console.log(`Winner publish endpoint listening on http://0.0.0.0:${httpPort}/winners`);
}

void bootstrap();
