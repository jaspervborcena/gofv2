import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { AuthenticatedUser } from './firebase-auth.guard';

const MAX_PLAYERS = 160;
const DOCUMENT_VERSION = process.env.APP_VERSION ?? '1.0.0';

interface ParticipantInput {
  name: string;
  customNumber?: number;
  mobileNumber?: string;
  remarks?: string;
}

interface PlayerSummary {
  id: string;
  name: string;
  assignedNumber: number;
}

function firestore() {
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}

@Injectable()
export class ParticipantsService {
  async joinGame(
    user: AuthenticatedUser,
    gameUid: string,
    body: Record<string, unknown>
  ): Promise<{ assignedNumber: number }> {
    const input = this.validateInput(body);
    const database = firestore();
    const gameRef = database.collection('games').doc(gameUid);
    const participantRef = database.collection('participants').doc(`${gameUid}-${user.uid}`);
    const participantsQuery = database.collection('participants').where('gameUid', '==', gameUid);

    return database.runTransaction(async (transaction) => {
      const [gameSnapshot, existingParticipant, participantsSnapshot] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(participantRef),
        transaction.get(participantsQuery)
      ]);
      if (!gameSnapshot.exists) {
        throw new NotFoundException('This game is no longer available.');
      }
      if (existingParticipant.exists) {
        throw new ConflictException('You have already participated in this game.');
      }

      const game = gameSnapshot.data() ?? {};
      const digitCount = this.digitCount(game['digitCount']);
      const maximumNumber = 10 ** digitCount - 1;
      const players = new Map<string, PlayerSummary>();
      const gamePlayers = Array.isArray(game['players']) ? game['players'] : [];
      gamePlayers.forEach((value, index) => {
        const player = this.playerSummary(value, `game-player-${index}`);
        if (player) {
          players.set(player.id, player);
        }
      });
      participantsSnapshot.docs.forEach((participant) => {
        const record = this.playerSummary(participant.data(), participant.id);
        if (record) {
          players.set(record.id, record);
        }
      });

      if (players.size >= MAX_PLAYERS) {
        throw new ConflictException(`This raffle already has ${MAX_PLAYERS} players and cannot accept more entries.`);
      }
      if ([...players.values()].some((player) =>
        player.name.trim().toLocaleLowerCase() === input.name.toLocaleLowerCase())) {
        throw new ConflictException(`The name "${input.name}" has already joined this raffle.`);
      }

      const usedNumbers = new Set([...players.values()].map((player) => player.assignedNumber));
      const numberMode = game['numberMode'] ?? game['numberStyle'] ?? 'random';
      const assignedNumber = input.customNumber ?? (numberMode === 'ordered'
        ? Math.max(0, ...usedNumbers) + 1
        : this.randomAvailableNumber(digitCount, usedNumbers));
      if (assignedNumber === null) {
        throw new ConflictException('This raffle has no available ticket numbers.');
      }
      if (assignedNumber > maximumNumber) {
        throw new ConflictException(input.customNumber !== undefined
          ? `Enter a number from 1 to ${maximumNumber}.`
          : 'This raffle has no available ticket numbers.');
      }
      if (usedNumbers.has(assignedNumber)) {
        throw new ConflictException(`The number ${String(assignedNumber).padStart(digitCount, '0')} is already in use.`);
      }

      const joinedAt = new Date();
      transaction.create(participantRef, {
        id: participantRef.id,
        gameId: typeof game['gameId'] === 'string' ? game['gameId'] : gameUid,
        gameUid,
        userId: user.uid,
        name: input.name,
        assignedNumber,
        status: 'active',
        joinedAt: joinedAt.toISOString(),
        ...(input.mobileNumber ? { mobileNumber: input.mobileNumber } : {}),
        ...(input.remarks ? { remarks: input.remarks } : {}),
        createdAt: joinedAt.toISOString(),
        updatedAt: joinedAt.toISOString(),
        createdBy: user.uid,
        updatedBy: user.uid,
        expireAt: Timestamp.fromDate(new Date(joinedAt.getTime() + 45 * 24 * 60 * 60 * 1000)),
        version: DOCUMENT_VERSION
      });
      return { assignedNumber };
    });
  }

  private validateInput(body: Record<string, unknown>): ParticipantInput {
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!name || name.length > 100) {
      throw new BadRequestException('Enter a name of 1 to 100 characters.');
    }

    let customNumber: number | undefined;
    if (body['customNumber'] !== undefined) {
      const value = body['customNumber'];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new BadRequestException('Enter a valid ticket number.');
      }
      customNumber = value;
    }

    const mobileNumber = this.optionalString(body['mobileNumber']);
    const remarks = this.optionalString(body['remarks']);
    if (mobileNumber && mobileNumber.length > 32) {
      throw new BadRequestException('The mobile number is too long.');
    }

    return {
      name,
      ...(customNumber !== undefined ? { customNumber } : {}),
      ...(mobileNumber ? { mobileNumber } : {}),
      ...(remarks ? { remarks } : {})
    };
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private digitCount(value: unknown): number {
    const parsed = Number(value ?? 3);
    return Number.isFinite(parsed) ? Math.min(6, Math.max(3, Math.floor(parsed))) : 3;
  }

  private playerSummary(value: unknown, fallbackId: string): PlayerSummary | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const player = value as Record<string, unknown>;
    const assignedNumber = Number(player['assignedNumber']);
    if (typeof player['name'] !== 'string' || !Number.isFinite(assignedNumber)) {
      return null;
    }
    return {
      id: typeof player['id'] === 'string' ? player['id'] : fallbackId,
      name: player['name'],
      assignedNumber
    };
  }

  private randomAvailableNumber(digitCount: number, usedNumbers: Set<number>): number | null {
    const minimum = 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    const range = maximum - minimum + 1;
    const start = Math.floor(Math.random() * range);
    for (let offset = 0; offset < range; offset += 1) {
      const number = minimum + (start + offset) % range;
      if (!usedNumbers.has(number)) {
        return number;
      }
    }
    return null;
  }
}
