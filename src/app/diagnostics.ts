import { environment } from '../environments/environment';

function currentPageUrl(): string {
  return typeof window === 'undefined' ? 'unknown' : window.location.href;
}

function displayUrl(value: string): string {
  try {
    const url = new URL(value, currentPageUrl());
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

export function installDiagnostics(): void {
  if (typeof window === 'undefined') {
    return;
  }

  console.info('[App] Runtime configuration', {
    pageUrl: displayUrl(window.location.href),
    production: environment.production,
    paymentApiOrigin: new URL(environment.paymentApiUrl).origin
  });

  window.addEventListener('error', (event) => {
    const element = event.target instanceof HTMLElement ? event.target : null;
    const resourceUrl = element?.getAttribute('src') ?? element?.getAttribute('href');
    console.error('[App] Browser error', {
      message: event.message,
      source: event.filename || (resourceUrl ? displayUrl(resourceUrl) : undefined),
      line: event.lineno,
      column: event.colno,
      pageUrl: displayUrl(window.location.href),
      error: event.error
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[App] Unhandled promise rejection', {
      pageUrl: displayUrl(window.location.href),
      reason: event.reason
    });
  });
}

export async function fetchWithLogging(
  input: RequestInfo | URL,
  init: RequestInit,
  context: string
): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const details = {
    context,
    method: (init.method ?? request?.method ?? 'GET').toUpperCase(),
    url: displayUrl(rawUrl),
    pageUrl: displayUrl(currentPageUrl()),
    callSite: new Error().stack
  };

  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      console.error('[Network] HTTP request failed', {
        ...details,
        status: response.status,
        statusText: response.statusText
      });
    }
    return response;
  } catch (error) {
    console.error('[Network] Request could not be completed', { ...details, error });
    throw error;
  }
}
