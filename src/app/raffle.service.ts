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
import { Firestore, collection, doc, getDoc, getDocs, orderBy, query, runTransaction, setDoc, where, writeBatch } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';
import { environment } from '../environments/environment';
import { FREE_MONTHLY_SPINS, planCatalog, UserSubscription } from './plan-schema';

export type SpinMode = 'simultaneous' | 'per-digit';
export type NumberMode = 'random' | 'ordered';
export type SubscriptionPlan = 'free' | 'basic' | 'standard';

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
  plan?: SubscriptionPlan;
  playersCount?: number;
  spinsRemaining?: number;
  spinPeriod?: string;
  createdAt: string;
  lastActiveAt: string;
}

interface GuestSpinProfile {
  id: 'guest';
  plan: 'free';
  spinsRemaining: number;
  spinPeriod: string;
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
  invitationLink?: string;
  qrCodeUrl?: string;
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
  numberStyle?: NumberMode;
  drawMode?: SpinMode;
  remarks?: string;
  players: Player[];
  history: DrawItem[];
  remainingDraws: number;
  createdAt: string;
  startAt: string;
  closeAt: string;
  closedAt: string;
  invitationLink?: string;
  qrCodeUrl?: string;
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
    await this.ensureUserSpinFields(signedInUser.uid);
    const plan = await this.getCurrentUserPlan(signedInUser.uid);
    const now = new Date().toISOString();
    try {
      await this.saveUserProfile({
        id: signedInUser.uid,
        uid: signedInUser.uid,
        displayName: signedInUser.displayName ?? '',
        email: signedInUser.email ?? undefined,
        photoUrl: signedInUser.photoURL ?? undefined,
        role: 'guest',
        plan,
        spinsRemaining: FREE_MONTHLY_SPINS,
        spinPeriod: new Date().toISOString().slice(0, 7),
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

    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    await this.ensureUserSpinFields(credential.user.uid);
  }

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    if (!this.firestoreEnabled) {
      throw new Error('Firebase auth is not configured for this app.');
    }

    return await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async createRaffle(input: { name: string; creatorId: string; mode: SpinMode; numberMode: NumberMode; digitCount?: number; remarks?: string; startAt?: string; closeAt?: string }): Promise<Raffle> {
    const gameUid = this.makeId();
    const gameId = this.makeGameId();
    const createdAt = new Date().toISOString();
    const startAtIso = input.startAt ?? createdAt;
    const closeAtIso = input.closeAt ?? new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
    const digitCount = this.normalizeDigitCount(input.digitCount);
    const invitationLink = this.createInvitationLink(gameId);
    const qrCodeUrl = await QRCode.toDataURL(invitationLink, { width: 240, margin: 1 });
    const raffle: Raffle = {
      id: gameUid,
      gameId,
      gameUid,
      name: input.name,
      creatorId: input.creatorId,
      mode: input.mode,
      numberMode: input.numberMode,
      digitCount,
      numberStyle: input.numberMode,
      drawMode: input.mode,
      remarks: input.remarks ?? '',
      players: [],
      history: [],
      remainingDraws: 10,
      createdAt,
      startAt: startAtIso,
      closeAt: closeAtIso,
      closedAt: closeAtIso,
      invitationLink,
      qrCodeUrl
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
        numberStyle: raffle.numberStyle,
        drawMode: raffle.drawMode,
        remarks: raffle.remarks,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        startAt: raffle.startAt,
        closeAt: raffle.closeAt,
        closedAt: raffle.closeAt,
        invitationLink: raffle.invitationLink,
        qrCodeUrl: raffle.qrCodeUrl
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
        }))
          .filter((raffle) => this.isRaffleActive(raffle))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const remoteIds = new Set(remoteRaffles.map((raffle) => raffle.id));
        return [...remoteRaffles, ...this.readLocal().filter((raffle) => !remoteIds.has(raffle.id) && this.isRaffleActive(raffle))];
      } catch {
        // Fall back to games created in this browser when Firebase is unavailable.
      }
    }

    return this.readLocal()
      .map((raffle) => this.normalizeRaffle({
        ...raffle,
        history: this.normalizeHistory(raffle.history ?? [])
      }))
      .filter((raffle) => this.isRaffleActive(raffle));
  }

  async findRaffle(gameId: string): Promise<Raffle | null> {
    const authUser = this.firestoreEnabled
      ? this.auth.currentUser ?? await firstValueFrom(this.user$)
      : null;

    if (this.firestoreEnabled && authUser) {
      try {
        const snapshot = await getDocs(query(
          collection(this.firestore, 'games'),
          where('gameId', '==', gameId)
        ));
        const remoteGame = snapshot.docs[0];
        if (remoteGame) {
          return this.normalizeRaffle({
            ...(remoteGame.data() as Raffle),
            id: remoteGame.id,
            gameUid: remoteGame.id,
            history: this.normalizeHistory((remoteGame.data() as Raffle).history ?? [])
          });
        }
      } catch {
        // Fall back to local games when Firebase is unavailable.
      }
    }

    return this.readLocal()
      .map((raffle) => this.normalizeRaffle({ ...raffle, history: this.normalizeHistory(raffle.history ?? []) }))
      .find((raffle) => raffle.gameId === gameId || raffle.id === gameId) ?? null;
  }

  async saveRaffle(raffle: Raffle): Promise<void> {
    if (this.firestoreEnabled) {
      const data = {
        name: raffle.name,
        creatorId: raffle.creatorId,
        mode: raffle.mode,
        numberMode: raffle.numberMode,
        digitCount: raffle.digitCount,
        numberStyle: raffle.numberMode,
        drawMode: raffle.mode,
        gameId: raffle.gameId ?? raffle.id,
        gameUid: raffle.gameUid ?? raffle.id,
        startAt: raffle.startAt ?? raffle.createdAt,
        closeAt: raffle.closeAt ?? raffle.closedAt ?? new Date(Date.parse(raffle.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
        closedAt: raffle.closeAt ?? raffle.closedAt ?? new Date(Date.parse(raffle.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invitationLink: raffle.invitationLink,
        qrCodeUrl: raffle.qrCodeUrl,
        remarks: raffle.remarks,
        history: raffle.history,
        remainingDraws: raffle.remainingDraws,
        createdAt: raffle.createdAt,
        ...(raffle.lastWinner ? { lastWinner: raffle.lastWinner } : {}),
        ...(raffle.lastNumber ? { lastNumber: raffle.lastNumber } : {})
      };
      await setDoc(doc(this.firestore, 'games', raffle.id), data, { merge: true });
      await this.syncGameCollections(raffle);
      await setDoc(doc(this.firestore, 'users', raffle.creatorId), {
        playersCount: raffle.players.length
      }, { merge: true });
      return;
    }

    this.writeLocal(raffle);
  }

  async joinRaffle(raffle: Raffle, player: Player): Promise<void> {
    if (this.firestoreEnabled) {
      const authUser = this.auth.currentUser ?? await firstValueFrom(this.user$);
      if (!authUser) {
        throw new Error('You must be signed in to join this game.');
      }

      const participant: ParticipantRecord = {
        id: player.id,
        gameId: raffle.gameId,
        gameUid: raffle.gameUid,
        userId: authUser.uid,
        name: player.name,
        assignedNumber: player.assignedNumber,
        status: player.status ?? 'active',
        joinedAt: new Date().toISOString(),
        ...(player.mobileNumber ? { mobileNumber: player.mobileNumber } : {}),
        ...(player.remarks ? { remarks: player.remarks } : {})
      };
      await setDoc(doc(this.firestore, 'participants', player.id), participant);
      return;
    }

    this.writeLocal({ ...raffle, players: [...raffle.players, player] });
  }

  async saveParticipant(raffle: Raffle, player: Player): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    const authUser = this.auth.currentUser ?? await firstValueFrom(this.user$);
    if (!authUser) {
      throw new Error('You must be signed in to join this game.');
    }

    const participant: ParticipantRecord = {
      id: player.id,
      gameId: raffle.gameId,
      gameUid: raffle.gameUid,
      userId: authUser.uid,
      name: player.name,
      assignedNumber: player.assignedNumber,
      status: player.status ?? 'active',
      joinedAt: new Date().toISOString(),
      ...(player.mobileNumber ? { mobileNumber: player.mobileNumber } : {}),
      ...(player.remarks ? { remarks: player.remarks } : {})
    };
    await setDoc(doc(this.firestore, 'participants', player.id), participant, { merge: true });
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    await setDoc(doc(this.firestore, 'users', profile.id), profile, { merge: true });
  }

  async getCurrentUserPlan(userId: string): Promise<SubscriptionPlan> {
    if (!this.firestoreEnabled) {
      return 'free';
    }

    let activeSubscription: UserSubscription | undefined;
    try {
      const subscriptionSnapshot = await getDocs(query(
        collection(this.firestore, 'subscriptions'),
        where('uid', '==', userId)
      ));
      activeSubscription = subscriptionSnapshot.docs
        .map((item) => item.data() as UserSubscription)
        .find((subscription) => {
          const isUsable = subscription.status === 'trial' || subscription.status === 'active';
          return isUsable && new Date(subscription.endDate).getTime() > Date.now();
        });
    } catch {
      // A user without a readable subscription falls back to the profile plan.
    }
    if (activeSubscription?.planType === 'basic' || activeSubscription?.planType === 'standard') {
      return activeSubscription.planType;
    }

    const snapshot = await getDoc(doc(this.firestore, 'users', userId));
    const plan = snapshot.data()?.['plan'];
    return plan === 'basic' || plan === 'standard' ? plan : 'free';
  }

  async ensureUserSpinFields(userId: string): Promise<void> {
    if (!this.firestoreEnabled) {
      return;
    }

    const userRef = doc(this.firestore, 'users', userId);
    const snapshot = await getDoc(userRef);
    const data = snapshot.data() ?? {};
    const period = new Date().toISOString().slice(0, 7);
    const plan = await this.getCurrentUserPlan(userId);
    const catalogPlan = planCatalog.find((item) => item.id === (plan === 'free' ? 'freemium' : plan));
    const monthlyLimit = catalogPlan?.monthlySpins ?? FREE_MONTHLY_SPINS;
    const updates: Record<string, string | number> = {};

    if (typeof data['plan'] !== 'string') {
      updates['plan'] = plan;
    }
    if (typeof data['spinsRemaining'] !== 'number' || data['spinPeriod'] !== period) {
      updates['spinsRemaining'] = monthlyLimit;
      updates['spinPeriod'] = period;
    }

    if (Object.keys(updates).length) {
      await setDoc(userRef, updates, { merge: true });
    }
  }

  async consumeSpin(): Promise<{ allowed: boolean; spinsRemaining: number }> {
    const authUser = this.auth.currentUser ?? await firstValueFrom(this.user$);
    if (!authUser) {
      return this.consumeGuestSpin();
    }

    const plan = await this.getCurrentUserPlan(authUser.uid);
    const catalogPlan = planCatalog.find((item) => item.id === (plan === 'free' ? 'freemium' : plan));
    const monthlyLimit = catalogPlan?.monthlySpins ?? FREE_MONTHLY_SPINS;
    const period = new Date().toISOString().slice(0, 7);
    const userRef = doc(this.firestore, 'users', authUser.uid);
    let remaining = 0;
    let allowed = false;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.data() ?? {};
      const currentRemaining = data['spinPeriod'] === period && typeof data['spinsRemaining'] === 'number'
        ? data['spinsRemaining']
        : monthlyLimit;

      if (currentRemaining <= 0) {
        remaining = 0;
        return;
      }

      allowed = true;
      remaining = currentRemaining - 1;
      transaction.set(userRef, {
        spinsRemaining: remaining,
        spinPeriod: period,
        plan: plan === 'free' ? 'free' : plan
      }, { merge: true });
    });

    return { allowed, spinsRemaining: remaining };
  }

  private async consumeGuestSpin(): Promise<{ allowed: boolean; spinsRemaining: number }> {
    const period = new Date().toISOString().slice(0, 7);
    const profile = await this.readGuestSpinProfile();
    const spinsRemaining = profile?.spinPeriod === period ? profile.spinsRemaining : 25;
    if (spinsRemaining <= 0) {
      await this.writeGuestSpinProfile({ id: 'guest', plan: 'free', spinsRemaining: 0, spinPeriod: period });
      return { allowed: false, spinsRemaining: 0 };
    }

    const nextProfile: GuestSpinProfile = {
      id: 'guest',
      plan: 'free',
      spinsRemaining: spinsRemaining - 1,
      spinPeriod: period
    };
    await this.writeGuestSpinProfile(nextProfile);
    return { allowed: true, spinsRemaining: nextProfile.spinsRemaining };
  }

  private openGuestSpinDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('gofv2-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('profiles', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async readGuestSpinProfile(): Promise<GuestSpinProfile | null> {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    const database = await this.openGuestSpinDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction('profiles', 'readonly').objectStore('profiles').get('guest');
      request.onsuccess = () => resolve((request.result as GuestSpinProfile | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async writeGuestSpinProfile(profile: GuestSpinProfile): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    const database = await this.openGuestSpinDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('profiles', 'readwrite').objectStore('profiles').put(profile);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async clearGuestSpinProfile(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    const database = await this.openGuestSpinDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('profiles', 'readwrite').objectStore('profiles').delete('guest');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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
    const invitationLink = `${baseUrl.replace(/\/$/, '')}/games/${gameId}/join`;
    const qrCodeUrl = await QRCode.toDataURL(invitationLink, { width: 240, margin: 1 });
    const invitation: GameInvitation = {
      id: this.makeId(),
      gameId,
      gameUid,
      token: this.makeId(),
      inviteUrl: invitationLink,
      invitationLink,
      qrCodeUrl,
      createdAt: new Date().toISOString()
    };

    if (this.firestoreEnabled) {
      await setDoc(doc(this.firestore, 'invitations', invitation.id), invitation);
    }

    return invitation;
  }

  private async syncGameCollections(raffle: Raffle): Promise<void> {
    const existingParticipants = await getDocs(query(
      collection(this.firestore, 'participants'),
      where('gameUid', '==', raffle.gameUid)
    ));
    const participantBatch = writeBatch(this.firestore);
    const currentParticipantIds = new Set(raffle.players.map((player) => player.id));
    existingParticipants.docs
      .filter((participant) => !currentParticipantIds.has(participant.id))
      .forEach((participant) => participantBatch.delete(participant.ref));

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
    const digitCount = this.normalizeDigitCount(raffle.digitCount);
    const numberMode = raffle.numberStyle ?? raffle.numberMode ?? 'random';
    const mode = raffle.drawMode ?? raffle.mode ?? 'simultaneous';
    const createdAt = this.normalizeDateValue(raffle.createdAt, new Date().toISOString());
    const fallbackCloseAt = new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedStartAt = this.normalizeDateValue(raffle.startAt, createdAt);
    const normalizedCloseAt = this.normalizeDateValue(raffle.closeAt ?? raffle.closedAt, fallbackCloseAt);
    return {
      ...raffle,
      gameId: raffle.gameId ?? raffle.id,
      gameUid: raffle.gameUid ?? raffle.id,
      createdAt,
      startAt: normalizedStartAt,
      closeAt: normalizedCloseAt,
      closedAt: normalizedCloseAt,
      invitationLink: raffle.invitationLink ?? this.createInvitationLink(raffle.gameId ?? raffle.id),
      qrCodeUrl: raffle.qrCodeUrl,
      digitCount,
      numberMode,
      numberStyle: numberMode,
      mode,
      drawMode: mode,
      players: Array.isArray(raffle.players) ? raffle.players : [],
      history: Array.isArray(raffle.history) ? raffle.history : [],
      remainingDraws: Number.isFinite(Number(raffle.remainingDraws)) ? Number(raffle.remainingDraws) : 0
    };
  }

  private normalizeDateValue(value: unknown, fallback: string): string {
    const candidate = typeof value === 'object' && value !== null && 'toDate' in value
      ? (value as { toDate: () => Date }).toDate()
      : value;
    const parsed = candidate instanceof Date ? candidate.getTime() : Date.parse(String(candidate ?? ''));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
  }

  private createInvitationLink(gameId: string): string {
    return `${environment.appBaseUrl}/games/${gameId}/join`;
  }

  private normalizeDigitCount(value: unknown): number {
    const parsed = Number(value ?? 3);
    return Number.isFinite(parsed) ? Math.min(6, Math.max(3, Math.floor(parsed))) : 3;
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

  isRaffleActive(raffle: Pick<Raffle, 'startAt' | 'closeAt' | 'createdAt' | 'closedAt'>): boolean {
    const startMs = Date.parse(raffle.startAt ?? raffle.createdAt);
    const closeMs = Date.parse(raffle.closeAt ?? raffle.closedAt ?? raffle.createdAt);
    const nowMs = Date.now();
    return nowMs >= startMs && nowMs <= closeMs;
  }
}
