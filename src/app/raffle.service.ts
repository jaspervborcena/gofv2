import { Injectable, inject } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, user } from '@angular/fire/auth';
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
      return;
    }

    await signInWithPopup(this.auth, new GoogleAuthProvider());
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

  private makeId(): string {
    return Math.random().toString(36).slice(2, 10);
  }
}
