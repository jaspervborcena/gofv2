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
import { Firestore, collection, doc, getDocs, orderBy, query, setDoc, where, writeBatch } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export type SpinMode = 'simultaneous' | 'per-digit';
export type NumberMode = 'random' | 'ordered';

export interface Player {
  id: string;
  name: string;
  assignedNumber: number;
  drawn: boolean;
  status?: 'active' | 'winner' | 'inactive' | 'removed';
  mobileNumber?: string;
  remarks?: string;
}

export interface UserProfile {
  id: string;
  uid?: string;
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
  gameUid: string;
  userId?: string;
  name: string;
  mobileNumber?: string;
  assignedNumber: number;
  remarks?: string;
  status: 'active' | 'winner' | 'inactive' | 'removed';
  joinedAt: string;
}

export interface DrawItem {
  id: string;
  roundNumber?: string;
  winnerName: string;
  drawnNumber: string;
  timestamp: string;
  participantId?: string;
  participantName?: string;
  participantMobileNumber?: string;
  winnerStatus: 'active' | 'processed';
  excludedFromList?: boolean;
  processedAt?: string;
}

export interface GameHistoryRecord extends DrawItem {
  gameId: string;
  gameUid: string;
  participantId?: string;
  drawnBy?: string;
}

export interface WinnerRecord {
  id: string;
  historyId: string;
  gameId: string;
  gameUid: string;
  userId: string;
  participantId?: string;
  participantName: string;
  roundNumber: string;
  wonAt: string;
  winnerStatus: 'active' | 'processed';
  excludedFromList?: boolean;
  processedAt?: string;
}

export interface GameInvitation {
  id: string;
  gameId: string;
  gameUid: string;
  token: string;
  inviteUrl: string;
  expiresAt?: string;
  createdAt: string;
}

export interface Raffle {
  id: string;
  gameId: string;
  gameUid: string;
  name: string;
  creatorId: string;
  mode: SpinMode;
  numberMode: NumberMode;
  digitCount?: number;
  numberOfDigits?: number;
  numberStyle?: NumberMode;
  drawMode?: SpinMode;
  remarks?: string;
  players: Player[];
  history: DrawItem[];
  remainingDraws: number;
  createdAt: string;
  closedAt: string;
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

  get currentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  getAuthErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'The email or password is incorrect.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Please sign in.';
      case 'auth/weak-password':
        return 'Please choose a stronger password with at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'The Google sign-in window was closed before sign-in completed.';
      case 'auth/network-request-failed':
        return 'We could not connect to Firebase. Check your internet connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return error instanceof Error ? error.message : fallback;
    }
  }

  getFirestoreErrorMessage(error: unknown, fallback = 'The data could not be saved. Please try again.'): string {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return 'You do not have permission to save this game. Please sign in and check your Firestore security rules.';
    }
    if (code === 'unavailable') {
      return 'Firestore is temporarily unavailable. Check your connection and try again.';
    }

    return error instanceof Error ? error.message : fallback;
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    const credential = await signInWithPopup(this.auth, new GoogleAuthProvider());
    const signedInUser = credential.user;
    const now = new Date().toISOString();
    try {
      await this.saveUserProfile({
        id: signedInUser.uid,
        uid: signedInUser.uid,
        displayName: signedInUser.displayName ?? '',
        email: signedInUser.email ?? undefined,
        photoUrl: signedInUser.photoURL ?? undefined,
        role: 'guest',
        createdAt: now,
        lastActiveAt: now
      });
    } catch (error) {
      console.warn('Google sign-in succeeded, but the user profile could not be saved.', error);
    }
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
    const gameUid = this.makeId();
    const createdAt = new Date().toISOString();
    const raffle: Raffle = {
      id: gameUid,
      gameId: this.makeGameId(),
      gameUid,
      name: input.name,
      creatorId: input.creatorId,
      mode: input.mode,
      numberMode: input.numberMode,
      digitCount: input.digitCount ?? 3,
      numberOfDigits: input.digitCount ?? 3,
      numberStyle: input.numberMode,
      drawMode: input.mode,
      remarks: input.remarks ?? '',
      players: [],
      history: [],
      remainingDraws: 10,
      createdAt,
      closedAt: new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    if (this.firestoreEnabled) {
      await setDoc(doc(this.firestore, 'games', raffle.gameUid), {
        id: raffle.gameUid,
        gameId: raffle.gameId,
        gameUid: raffle.gameUid,
        name: raffle.name,
        creatorId: raffle.creatorId,
        mode: raffle.mode,
        numberMode: raffle.numberMode,
        digitCount: raffle.digitCount,
        numberOfDigits: raffle.numberOfDigits,
        numberStyle: raffle.numberStyle,
        drawMode: raffle.drawMode,
        remarks: raffle.remarks,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        closedAt: raffle.closedAt
      });
      return raffle;
    }

    this.writeLocal(raffle);
    return raffle;
  }

  async listRaffles(): Promise<Raffle[]> {
    const authUser = this.firestoreEnabled
      ? this.auth.currentUser ?? await firstValueFrom(this.user$)
      : null;

    if (this.firestoreEnabled && authUser) {
      try {
        const q = query(
          collection(this.firestore, 'games'),
          where('creatorId', '==', authUser.uid)
        );
        const snapshot = await getDocs(q);
        const remoteRaffles = snapshot.docs.map((docSnapshot) => this.normalizeRaffle({
          ...(docSnapshot.data() as Raffle),
          id: docSnapshot.id,
          gameUid: docSnapshot.id,
          history: this.normalizeHistory((docSnapshot.data() as Raffle).history ?? [])
        })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const remoteIds = new Set(remoteRaffles.map((raffle) => raffle.id));
        return [...remoteRaffles, ...this.readLocal().filter((raffle) => !remoteIds.has(raffle.id))];
      } catch {
        // Fall back to games created in this browser when Firebase is unavailable.
      }
    }

    return this.readLocal().map((raffle) => this.normalizeRaffle({
      ...raffle,
      history: this.normalizeHistory(raffle.history ?? [])
    }));
  }

  async saveRaffle(raffle: Raffle): Promise<void> {
    if (this.firestoreEnabled) {
      const data = {
        name: raffle.name,
        creatorId: raffle.creatorId,
        mode: raffle.mode,
        numberMode: raffle.numberMode,
        digitCount: raffle.digitCount,
        numberOfDigits: raffle.digitCount,
        numberStyle: raffle.numberMode,
        drawMode: raffle.mode,
        gameId: raffle.gameId ?? raffle.id,
        gameUid: raffle.gameUid ?? raffle.id,
        closedAt: raffle.closedAt ?? new Date(Date.parse(raffle.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
        remarks: raffle.remarks,
        history: raffle.history,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        ...(raffle.lastWinner ? { lastWinner: raffle.lastWinner } : {}),
        ...(raffle.lastNumber ? { lastNumber: raffle.lastNumber } : {})
      };
      await setDoc(doc(this.firestore, 'games', raffle.id), data, { merge: true });
      await this.syncGameCollections(raffle);
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

  async listParticipants(gameUid: string): Promise<ParticipantRecord[]> {
    if (!this.firestoreEnabled) {
      return [];
    }

    const snapshot = await getDocs(query(collection(this.firestore, 'participants'), where('gameUid', '==', gameUid)));
    return snapshot.docs
      .map((item) => ({ ...(item.data() as ParticipantRecord), id: item.id }))
      .filter((item) => item.gameUid === gameUid);
  }

  async listGameHistory(gameUid: string): Promise<GameHistoryRecord[]> {
    if (!this.firestoreEnabled) {
      return [];
    }

    const historyQuery = query(collection(this.firestore, 'history'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(historyQuery);
    return snapshot.docs
      .map((item) => ({ ...(item.data() as GameHistoryRecord), id: item.id }))
      .filter((item) => item.gameUid === gameUid);
  }

  async createGameInvitation(gameId: string, gameUid: string, baseUrl: string): Promise<GameInvitation> {
    const invitation: GameInvitation = {
      id: this.makeId(),
      gameId,
      gameUid,
      token: this.makeId(),
      inviteUrl: `${baseUrl.replace(/\/$/, '')}/games/${gameId}/join`,
      createdAt: new Date().toISOString()
    };

    if (this.firestoreEnabled) {
      await setDoc(doc(this.firestore, 'invitations', invitation.id), invitation);
    }

    return invitation;
  }

  private async syncGameCollections(raffle: Raffle): Promise<void> {
    const participantBatch = writeBatch(this.firestore);
    raffle.players.forEach((player) => {
      const participant: ParticipantRecord = {
        id: player.id,
        gameId: raffle.gameId,
        gameUid: raffle.gameUid,
        name: player.name,
        assignedNumber: player.assignedNumber,
        status: player.status ?? (player.drawn ? 'winner' : 'active'),
        joinedAt: raffle.createdAt,
        ...(player.mobileNumber ? { mobileNumber: player.mobileNumber } : {}),
        ...(player.remarks ? { remarks: player.remarks } : {})
      };
      participantBatch.set(doc(this.firestore, 'participants', player.id), participant, { merge: true });
    });
    await participantBatch.commit();

    await Promise.all(raffle.history.map((item) => {
      const history: GameHistoryRecord = {
        ...item,
        gameId: raffle.gameId,
        gameUid: raffle.gameUid,
        drawnNumber: item.drawnNumber
      };
      const winner: WinnerRecord = {
        id: item.id,
        historyId: item.id,
        gameId: raffle.gameId,
        gameUid: raffle.gameUid,
        userId: item.participantId ?? item.winnerName,
        participantId: item.participantId,
        participantName: item.participantName ?? item.winnerName,
        roundNumber: item.roundNumber ?? '',
        wonAt: item.timestamp,
        winnerStatus: item.winnerStatus,
        ...(item.excludedFromList ? { excludedFromList: true } : {}),
        ...(item.processedAt ? { processedAt: item.processedAt } : {})
      };
      return Promise.all([
        setDoc(doc(this.firestore, 'history', item.id), history, { merge: true }),
        setDoc(doc(this.firestore, 'winners', item.id), winner, { merge: true })
      ]);
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

  private normalizeHistory(history: DrawItem[]): DrawItem[] {
    return history.map((item) => ({
      ...item,
      winnerStatus: item.winnerStatus ?? 'active'
    }));
  }

  private normalizeRaffle(raffle: Raffle): Raffle {
    const digitCount = raffle.numberOfDigits ?? raffle.digitCount ?? 3;
    const numberMode = raffle.numberStyle ?? raffle.numberMode ?? 'random';
    const mode = raffle.drawMode ?? raffle.mode ?? 'simultaneous';
    return {
      ...raffle,
      gameId: raffle.gameId ?? raffle.id,
      gameUid: raffle.gameUid ?? raffle.id,
      closedAt: raffle.closedAt ?? new Date(Date.parse(raffle.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
      digitCount,
      numberOfDigits: digitCount,
      numberMode,
      numberStyle: numberMode,
      mode,
      drawMode: mode
    };
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

  private makeGameId(): string {
    return String(Date.now() % 100000000).padStart(8, '0');
  }
}
