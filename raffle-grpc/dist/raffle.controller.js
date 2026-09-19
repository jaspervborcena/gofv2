"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RaffleController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const rxjs_1 = require("rxjs");
const winner_stream_service_1 = require("./winner-stream.service");
let RaffleController = class RaffleController {
    winnerStream;
    constructor(winnerStream) {
        this.winnerStream = winnerStream;
    }
    subscribeWinners(request) {
        return this.winnerStream.subscribe(request.raffleId);
    }
    publishWinner(event) {
        if (!event?.raffleId || !event.spinId || !event.winnerId || !event.winnerName) {
            return { accepted: false };
        }
        this.winnerStream.emitWinner({
            raffleId: event.raffleId,
            spinId: event.spinId,
            winnerId: event.winnerId,
            winnerName: event.winnerName,
            prize: event.prize || ''
        });
        return { accepted: true };
    }
};
exports.RaffleController = RaffleController;
__decorate([
    (0, microservices_1.GrpcMethod)('RaffleService', 'SubscribeWinners'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], RaffleController.prototype, "subscribeWinners", null);
__decorate([
    (0, common_1.Post)('winners'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RaffleController.prototype, "publishWinner", null);
exports.RaffleController = RaffleController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [winner_stream_service_1.WinnerStreamService])
], RaffleController);
