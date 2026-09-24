import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { Request } from 'express';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

function firebaseAuth() {
  const app = getApps()[0] ?? initializeApp();
  return getAuth(app);
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';

    if (!token) {
      throw new UnauthorizedException('A Firebase bearer token is required.');
    }

    try {
      const decoded = await firebaseAuth().verifyIdToken(token);
      (request as Request & { user: AuthenticatedUser }).user = {
        uid: decoded.uid,
        email: decoded.email
      };
      return true;
    } catch {
      throw new UnauthorizedException('The Firebase token is invalid or expired.');
    }
  }
}
