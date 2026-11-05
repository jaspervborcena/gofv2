import { getPromoCodeErrorMessage } from './plans-page.component';

describe('getPromoCodeErrorMessage', () => {
  it('replaces Firestore permission errors with invalid-code feedback', () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied'
    });

    expect(getPromoCodeErrorMessage(error)).toBe('This promo code is invalid or unavailable.');
  });

  it('preserves useful non-permission error messages', () => {
    expect(getPromoCodeErrorMessage(new Error('The promo code has expired.')))
      .toBe('The promo code has expired.');
  });
});
