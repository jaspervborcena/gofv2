import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalDocument {
  title: string;
  sections: LegalSection[];
}

const documents: Record<'privacy' | 'terms', LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Information handled by the service',
        paragraphs: [
          'Depending on how you use Game of Fortunes, the service may handle your email address, sign-in provider details, display name and profile image, and profile details you provide such as your full name, nickname, or phone number.',
          'Raffle information may include game names and settings, invitation details, participant names or ticket numbers, draw history, and winner records. Payment records may include the selected plan, provider, order identifiers, amount, currency, status, email address, and any applied promotion code.'
        ]
      },
      {
        heading: 'How information is used',
        paragraphs: [
          'Information is used to authenticate accounts, create and manage raffles, show participant and winner information, maintain profile and plan features, process payments, protect the service, and respond to support requests.'
        ]
      },
      {
        heading: 'Service providers and visibility',
        paragraphs: [
          'The app uses Firebase Authentication and Cloud Firestore. PayPal is used for payment checkout when available. These providers process information under their own terms and privacy policies.',
          'Raffle organizers and participants may see game and participant information needed to use a raffle. Confirm the exact visibility and any additional hosting or service providers before publishing this policy.'
        ]
      },
      {
        heading: 'Storage, retention, and your choices',
        paragraphs: [
          'The app stores your theme choice and legal acceptance in browser local storage. Profile details can be edited through the profile interface. The data retention period, account deletion process, and any legal or regional privacy rights must be finalized before publication.'
        ]
      },
      {
        heading: 'Contact and policy details to complete',
        paragraphs: [
          'Before launch, add the responsible legal entity, a privacy contact email, the applicable jurisdiction, retention periods, and instructions for access, correction, and deletion requests. Confirm any age restrictions and the providers used by the deployed service.'
        ]
      }
    ]
  },
  terms: {
    title: 'Terms & Conditions',
    sections: [
      {
        heading: 'Using Game of Fortunes',
        paragraphs: [
          'Game of Fortunes provides tools to create raffles, invite participants, manage entries, and run draws. By using the service, you agree to these terms. Add the operator’s legal name, minimum age, and eligibility requirements before publication.'
        ]
      },
      {
        heading: 'Accounts and user content',
        paragraphs: [
          'You are responsible for keeping your account credentials secure and for activity under your account. You must have permission to submit names, contact details, or other information about participants, and must not use the service to violate another person’s rights or applicable law.'
        ]
      },
      {
        heading: 'Raffles and organizer responsibilities',
        paragraphs: [
          'Organizers are responsible for raffle rules, participant notices, eligibility, prizes, winner communications, and compliance with laws that apply to their event. The service supplies raffle tools; it does not determine whether a particular raffle is lawful.'
        ]
      },
      {
        heading: 'Plans and payments',
        paragraphs: [
          'Paid plan options and prices are shown in the app. Checkout may be handled by PayPal or another provider enabled for the service. Before publication, specify billing and renewal terms, cancellation steps, refunds, taxes, and how plan changes affect access.'
        ]
      },
      {
        heading: 'Availability and changes',
        paragraphs: [
          'The service may change or become temporarily unavailable. Add the final support process, suspension and termination rules, warranty disclaimer, and limits of liability before relying on these terms.'
        ]
      },
      {
        heading: 'Governing law and contact',
        paragraphs: [
          'Specify the governing law, dispute process, operator legal name, and contact details before publication.'
        ]
      }
    ]
  }
};

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss'
})
export class LegalPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly document: LegalDocument = documents[this.route.snapshot.data['policy'] === 'terms' ? 'terms' : 'privacy'];
}