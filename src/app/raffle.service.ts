import { Injectable, inject } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, user } from '@angular/fire/auth';
import { Firestore, addDoc, collection, doc, getDocs, orderBy, query, updateDoc } from '@angular/fire/firestore';
import { environment } from '../environments/environment';

export type SpinMode = 'simultaneous' | 'per-digit';
export type NumberMode = 'random' | 'ordered';

export interface Player {
  id: string;
  name: string;
  assignedNumber: number;
  drawn: boolean;
}

export interface DrawItem {
  id: string;
  winnerName: string;
  drawnNumber: string;
  timestamp: string;
}

export interface Raffle {
  id: string;
  name: string;
  creatorId: string;
  mode: SpinMode;
  numberMode: NumberMode;
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
      console.warn('Firebase auth is not configured. Continuing in local mode.');
      throw new Error('Firebase auth is not configured for this app.');
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithRedirect(this.auth, provider);
    } catch (error: unknown) {
      const code = this.getErrorCode(error);

      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithPopup(this.auth, provider);
        return;
      }

      if (code === 'auth/operation-not-allowed') {
        throw new Error('Google sign-in is not enabled in Firebase Authentication. Please enable the Google provider in Firebase Console.');
      }

      throw this.normalizeError(error);
    }
  }

  async signOut(): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    await firebaseSignOut(this.auth);
  }

  async createRaffle(input: { name: string; creatorId: string; mode: SpinMode; numberMode: NumberMode }): Promise<Raffle> {
    const raffle: Raffle = {
      id: this.makeId(),
      name: input.name,
      creatorId: input.creatorId,
      mode: input.mode,
      numberMode: input.numberMode,
      players: [],
      history: [],
      remainingDraws: 10,
      createdAt: new Date().toISOString()
    };

    if (this.firestoreEnabled) {
      const ref = await addDoc(collection(this.firestore, 'raffles'), raffle);
      raffle.id = ref.id;
      await updateDoc(doc(this.firestore, 'raffles', ref.id), { id: ref.id });
    } else {
      const existing = this.readLocal();
      existing.unshift(raffle);
      localStorage.setItem(this.storageKey, JSON.stringify(existing));
    }

    return raffle;
  }

  async listRaffles(): Promise<Raffle[]> {
    if (this.firestoreEnabled) {
      const q = query(collection(this.firestore, 'raffles'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnapshot) => ({ ...(docSnapshot.data() as Raffle), id: docSnapshot.id }));
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
        players: raffle.players,
        history: raffle.history,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        lastWinner: raffle.lastWinner,
        lastNumber: raffle.lastNumber
      };
      await updateDoc(doc(this.firestore, 'raffles', raffle.id), data);
      return;
    }

    const existing = this.readLocal().filter((item) => item.id !== raffle.id);
    existing.unshift(raffle);
    localStorage.setItem(this.storageKey, JSON.stringify(existing));
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

  private getErrorCode(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }

    return null;
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error('Unable to sign in with Google right now.');
  }

  private makeId(): string {
    return Math.random().toString(36).slice(2, 10);
  }
}
