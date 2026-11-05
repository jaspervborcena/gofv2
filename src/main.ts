import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installDiagnostics } from './app/diagnostics';

installDiagnostics();
bootstrapApplication(AppComponent, appConfig)
  .catch((error) => console.error('[App] Angular bootstrap failed', {
    pageUrl: window.location.origin + window.location.pathname,
    error
  }));
