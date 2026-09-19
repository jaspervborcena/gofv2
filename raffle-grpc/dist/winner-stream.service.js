"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WinnerStreamService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let WinnerStreamService = class WinnerStreamService {
    streams = new Map();
    subscribe(raffleId) {
        const stream = this.getStream(raffleId);
        return new rxjs_1.Observable((subscriber) => {
            const subscription = stream.subscribe(subscriber);
            return () => subscription.unsubscribe();
        });
    }
    emitWinner(event) {
        this.getStream(event.raffleId).next(event);
    }
    getStream(raffleId) {
        let stream = this.streams.get(raffleId);
        if (!stream) {
            stream = new rxjs_1.Subject();
            this.streams.set(raffleId, stream);
        }
        return stream;
    }
};
exports.WinnerStreamService = WinnerStreamService;
exports.WinnerStreamService = WinnerStreamService = __decorate([
    (0, common_1.Injectable)()
], WinnerStreamService);
