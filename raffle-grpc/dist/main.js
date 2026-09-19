"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const microservices_1 = require("@nestjs/microservices");
const node_path_1 = require("node:path");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const httpApp = await core_1.NestFactory.create(app_module_1.AppModule);
    httpApp.enableCors();
    httpApp.connectMicroservice({
        transport: microservices_1.Transport.GRPC,
        options: {
            package: 'raffle',
            protoPath: (0, node_path_1.join)(__dirname, '..', 'proto', 'raffle.proto'),
            url: process.env.GRPC_URL || '0.0.0.0:50051'
        }
    });
    await httpApp.startAllMicroservices();
    await httpApp.listen(Number(process.env.HTTP_PORT || 3001), '0.0.0.0');
    console.log('Raffle gRPC server listening on 0.0.0.0:50051');
    console.log('Winner publish endpoint listening on http://localhost:3001/winners');
}
void bootstrap();
