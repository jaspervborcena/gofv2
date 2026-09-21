import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  user,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail
} from '@angular/fire/auth';
import type { UserCredential } from 'firebase/auth';
import { Firestore, collection, doc, getDocs, orderBy, query, setDoc, updateDoc } from '@angular/fire/firestore';
import { environment } from '../environments/environment';

export type SpinMode = 'simultaneous' | 'per-digit';
export type NumberMode = 'random' | 'ordered';

export interface Player {
  id: string;
  name: string;
  assignedNumber: number;
  drawn: boolean;
  mobileNumber?: string;
  remarks?: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
  photoUrl?: string;
  role: 'guest' | 'host';
  createdAt: string;
  lastActiveAt: string;
}

export interface ParticipantRecord {
  id: string;
  gameId: string;
  userId?: string;
  name: string;
  mobileNumber?: string;
  assignedNumber: number;
  remarks?: string;
  status: 'active' | 'winner' | 'removed';
  joinedAt: string;
}

export interface DrawItem {
  id: string;
  roundNumber?: string;
  winnerName: string;
  drawnNumber: string;
  timestamp: string;
}

export interface GameHistoryRecord extends DrawItem {
  gameId: string;
  participantId?: string;
  drawnBy?: string;
}

export interface GameInvitation {
  id: string;
  gameId: string;
  token: string;
  inviteUrl: string;
  expiresAt?: string;
  createdAt: string;
}

export interface Raffle {
  id: string;
  name: string;
  creatorId: string;
  mode: SpinMode;
  numberMode: NumberMode;
  digitCount?: number;
  remarks?: string;
  players: Player[];
  history: DrawItem[];
  remainingDraws: number;
  createdAt: string;
  lastWinner?: string;
  lastNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class RaffleService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  readonly user$ = user(this.auth);

  private readonly storageKey = 'gofv2-raffles';
  private readonly firestoreEnabled = !environment.firebaseConfig.apiKey.includes('YOUR_') && !!environment.firebaseConfig.projectId;

  async signInWithGoogle(): Promise<void> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    await firebaseSignOut(this.auth);
  }

  async fetchSignInMethodsForEmail(email: string): Promise<string[]> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    return await fetchSignInMethodsForEmail(this.auth, email);
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    return await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async createRaffle(input: { name: string; creatorId: string; mode: SpinMode; numberMode: NumberMode; digitCount?: number; remarks?: string }): Promise<Raffle> {
    const raffle: Raffle = {
      id: this.makeId(),
      name: input.name,
      creatorId: input.creatorId,
      mode: input.mode,
      numberMode: input.numberMode,
      digitCount: input.digitCount ?? 3,
      remarks: input.remarks ?? '',
      players: [],
      history: [],
      remainingDraws: 10,
      createdAt: new Date().toISOString()
    };

    if (this.firestoreEnabled) {
      try {
        await setDoc(doc(this.firestore, 'games', raffle.id), raffle);
        return raffle;
      } catch {
        // Keep local development usable when Firebase rules or connectivity reject the write.
      }
    }

    this.writeLocal(raffle);
    return raffle;
  }

  async listRaffles(): Promise<Raffle[]> {
    if (this.firestoreEnabled) {
      try {
        const q = query(collection(this.firestore, 'games'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const remoteRaffles = snapshot.docs.map((docSnapshot) => ({ ...(docSnapshot.data() as Raffle), id: docSnapshot.id }));
        const remoteIds = new Set(remoteRaffles.map((raffle) => raffle.id));
        return [...remoteRaffles, ...this.readLocal().filter((raffle) => !remoteIds.has(raffle.id))];
      } catch {
        // Fall back to games created in this browser when Firebase is unavailable.
      }
    }

    return this.readLocal();
  }

  async saveRaffle(raffle: Raffle): Promise<void> {
    if (this.firestoreEnabled) {
      const data = {
        name: raffle.name,
        creatorId: raffle.creatorId,
        mode: raffle.mode,
        numberMode: raffle.numberMode,
        digitCount: raffle.digitCount,
        remarks: raffle.remarks,
        players: raffle.players,
        history: raffle.history,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        lastWinner: raffle.lastWinner,
        lastNumber: raffle.lastNumber
      };
      await updateDoc(doc(this.firestore, 'games', raffle.id), data);
      await this.syncGameSubcollections(raffle);
      return;
    }

    this.writeLocal(raffle);
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    await setDoc(doc(this.firestore, 'users', profile.id), profile, { merge: true });
  }

  async listParticipants(gameId: string): Promise<ParticipantRecord[]> {
    if (!this.firestoreEnabled) {
      return [];
    }

    const snapshot = await getDocs(collection(this.firestore, 'games', gameId, 'participants'));
    return snapshot.docs.map((item) => ({ ...(item.data() as ParticipantRecord), id: item.id }));
  }

  async listGameHistory(gameId: string): Promise<GameHistoryRecord[]> {
    if (!this.firestoreEnabled) {
      return [];
    }

    const historyQuery = query(
      collection(this.firestore, 'games', gameId, 'history'),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(historyQuery);
    return snapshot.docs.map((item) => ({ ...(item.data() as GameHistoryRecord), id: item.id }));
  }

  async createGameInvitation(gameId: string, baseUrl: string): Promise<GameInvitation> {
    const invitation: GameInvitation = {
      id: this.makeId(),
      gameId,
      token: this.makeId(),
      inviteUrl: `${baseUrl.replace(/\/$/, '')}/games/${gameId}/join`,
      createdAt: new Date().toISOString()
    };

    if (this.firestoreEnabled) {
      await setDoc(doc(this.firestore, 'games', gameId, 'invitations', invitation.id), invitation);
    }

    return invitation;
  }

  private async syncGameSubcollections(raffle: Raffle): Promise<void> {
    await Promise.all(raffle.players.map((player) => {
      const participant: ParticipantRecord = {
        id: player.id,
        gameId: raffle.id,
        name: player.name,
         mobileNumber: player.mobileNumber,
        assignedNumber: player.assignedNumber,
         remarks: player.remarks,
        status: player.drawn ? 'winner' : 'active',
        joinedAt: raffle.createdAt
      };
      return setDoc(doc(this.firestore, 'games', raffle.id, 'participants', player.id), participant, { merge: true });
    }));

    await Promise.all(raffle.history.map((item) => {
      const history: GameHistoryRecord = {
        ...item,
        gameId: raffle.id,
        drawnNumber: item.drawnNumber
      };
      return setDoc(doc(this.firestore, 'games', raffle.id, 'history', item.id), history, { merge: true });
    }));
  }

  private readLocal(): Raffle[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      return JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as Raffle[];
    } catch {
      return [];
    }
  }

  private writeLocal(raffle: Raffle): void {
    const existing = this.readLocal().filter((item) => item.id !== raffle.id);
    existing.unshift(raffle);
    localStorage.setItem(this.storageKey, JSON.stringify(existing));
  }

  private makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.random() * 16 | 0;
      const value = character === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }
}
