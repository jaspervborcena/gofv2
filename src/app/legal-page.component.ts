import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RaffleService } from './raffle.service';

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalDocument {
  title: string;
  intro: string;
  isDraft?: boolean;
  contactEmail?: string;
  sections: LegalSection[];
}

const contactEmail = 'gameoffortunes777@gmail.com';

const documents: Record<'about' | 'contact' | 'privacy' | 'terms', LegalDocument> = {
  about: {
    title: 'About Game of Fortunes',
    intro: 'Game of Fortunes is a tool for fun, non-gambling raffles, giveaways, and community events, powered by Tovrika Technologies Inc.',
    sections: [
      {
        heading: 'Make events fun and easy to run',
        paragraphs: [
          'Create an event, manage participants, run a live draw, and share an invitation link with your community.',
          'Game of Fortunes provides tools for organizers. It does not operate gambling, betting, or wagering activities.'
        ]
      }
    ]
  },
  contact: {
    title: 'Contact',
    intro: 'For questions or support, send a message through the form below.',
    sections: [
      {
        heading: 'Support',
        paragraphs: ['Include a short description of your question or issue. Do not email passwords or payment card details.']
      }
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'Last Updated: October 12, 2026',
    sections: [
      {
        heading: 'Who We Are',
        paragraphs: [
          'Game of Fortunes is operated by Tovrika Technologies Inc. ("Game of Fortunes," "Service," "Platform," "we," "our," or "us").',
          'For questions, concerns, or privacy-related requests, you may contact us at gameoffortunes777@gmail.com or visit https://www.gameoffortunes.com/.'
        ]
      },
      {
        heading: 'Information We Collect',
        paragraphs: [
          'We collect information necessary to provide and improve our services. This may include account information such as email address, display name, profile photo, authentication provider details, full name, nickname, and phone number when you provide them.',
          'We also collect raffle and event details such as game names, settings, ticket information, participant details, draw history, winner records, organizer information, and event configuration data. If you purchase a subscription or premium feature, we may collect your account email, transaction identifier, plan, amount paid, currency, payment status, and promotion details.',
          'We may also automatically collect technical data such as IP address, browser type, device information, operating system, access dates and times, usage activity, error reports, and security logs.'
        ]
      },
      {
        heading: 'How We Use Your Information',
        paragraphs: [
          'We use your information to create and manage accounts, authenticate users, operate raffles and events, display participant and winner information, process subscriptions and payments, provide customer support, improve platform performance, monitor service reliability, detect fraud and abuse, protect users and the platform, and comply with legal obligations.',
          'We may use your information to enforce our Terms and Conditions and to maintain the security and integrity of the Service.'
        ]
      },
      {
        heading: 'Participant and Winner Visibility',
        paragraphs: [
          'Game of Fortunes is designed to manage raffles, contests, and promotional events. Depending on event settings, participant names, nicknames, ticket numbers, draw results, winner information, and event details may be visible to organizers, participants, or viewers.',
          'By using the Service, you acknowledge that raffle-related information may be displayed as part of normal platform operation.'
        ]
      },
      {
        heading: 'Third-Party Services',
        paragraphs: [
          'To provide our services, we may use trusted third-party providers. Firebase may be used for authentication, database storage, hosting, and security monitoring. PayPal may be used for payment processing and subscription purchases.',
          'These providers process information according to their own privacy policies and terms of service.'
        ]
      },
      {
        heading: 'Cookies and Local Storage',
        paragraphs: [
          'Game of Fortunes may use cookies, browser storage, and similar technologies to maintain user sessions, remember preferences, store theme settings, record legal agreement acceptance, and improve user experience and security.',
          'You may disable cookies through your browser settings, although some features may not function properly.'
        ]
      },
      {
        heading: 'Data Retention',
        paragraphs: [
          'We retain information only as long as necessary to operate the Service and comply with legal obligations. Account information is retained while the account remains active, raffle and event records may be retained after event completion, and payment records may be retained for accounting, tax, and compliance purposes.',
          'We may delete or anonymize information when it is no longer required.'
        ]
      },
      {
        heading: 'Account Deletion',
        paragraphs: [
          'You may request deletion of your account by contacting us at gameoffortunes777@gmail.com. Upon verification of your request, we may delete account information, remove access credentials, and anonymize eligible records.',
          'Certain information may be retained when required for legal compliance, accounting and tax obligations, fraud prevention, security investigations, or dispute resolution.'
        ]
      },
      {
        heading: 'Data Security',
        paragraphs: [
          'We implement reasonable technical, organizational, and administrative measures to protect information from unauthorized access, disclosure, alteration, loss, and misuse.',
          'While we work to protect your information, no method of electronic transmission or storage can be guaranteed to be completely secure.'
        ]
      },
      {
        heading: 'International Data Processing',
        paragraphs: [
          'Our service providers may process or store information in countries outside your country of residence. By using the Service, you consent to such processing where permitted by applicable law.'
        ]
      },
      {
        heading: 'Your Privacy Rights',
        paragraphs: [
          'Depending on applicable laws, you may have the right to access your information, correct inaccurate information, update account details, request deletion of personal information, withdraw consent where applicable, and request clarification regarding how information is processed.',
          'To exercise these rights, contact gameoffortunes777@gmail.com.'
        ]
      },
      {
        heading: 'Children\'s Privacy',
        paragraphs: [
          'Game of Fortunes is not intended for children under thirteen (13) years of age. We do not knowingly collect personal information from children under 13.',
          'If we learn that personal information from a child has been collected without appropriate authorization, we will take reasonable steps to remove that information.'
        ]
      },
      {
        heading: 'Third-Party Websites',
        paragraphs: [
          'The Service may contain links to third-party websites, services, or applications. We are not responsible for their privacy or security practices or their content and policies.',
          'Users should review the privacy policies of any third-party websites they visit.'
        ]
      },
      {
        heading: 'Changes to This Privacy Policy',
        paragraphs: [
          'We may update this Privacy Policy from time to time. Any updates will be posted on this page together with a revised Last Updated date.',
          'Your continued use of the Service after changes become effective constitutes acceptance of the updated Privacy Policy.'
        ]
      },
      {
        heading: 'Contact Us',
        paragraphs: [
          'If you have questions, concerns, or requests regarding this Privacy Policy, please contact Game of Fortunes, operated by Tovrika Technologies Inc., at gameoffortunes777@gmail.com or visit https://www.gameoffortunes.com/.'
        ]
      }
    ]
  },
  terms: {
    title: 'Terms & Conditions',
    intro: 'Last Updated: October 12, 2026',
    sections: [
      {
        heading: 'About the Service',
        paragraphs: [
          'Game of Fortunes is a software platform that provides tools for creating, managing, and conducting raffles, giveaways, promotions, drawings, and similar events.',
          'The platform may provide features including but not limited to event creation, ticket management, participant management, random winner selection, draw history, winner tracking, subscription management, and reporting. Game of Fortunes provides software tools only and does not act as the organizer, sponsor, promoter, administrator, or operator of user-created events.'
        ]
      },
      {
        heading: 'No Gambling or Betting',
        paragraphs: [
          'Game of Fortunes is not a gambling, betting, casino, lottery, or wagering platform. The Service does not accept bets, hold wagers, operate casino games, facilitate sports betting, issue gaming licenses, or provide gambling services.',
          'Users and organizers are solely responsible for ensuring that their events, promotions, and activities comply with all applicable laws, regulations, permits, licenses, and governmental requirements in their jurisdiction. Game of Fortunes makes no representation regarding the legality of any event created through the platform.'
        ]
      },
      {
        heading: 'Eligibility',
        paragraphs: [
          'You must be at least eighteen (18) years old or the legal age of majority in your jurisdiction to create an account and use the Service.',
          'By using the Service, you represent that you have the legal capacity to enter into these Terms, the information you provide is accurate, and you will comply with all applicable laws and regulations.'
        ]
      },
      {
        heading: 'User Accounts',
        paragraphs: [
          'Certain features require registration. You are responsible for maintaining account security, protecting your password, monitoring activities under your account, and keeping account information accurate and current.',
          'You agree to notify us promptly if you become aware of unauthorized use of your account.'
        ]
      },
      {
        heading: 'Organizer Responsibilities',
        paragraphs: [
          'Organizers are solely responsible for creating raffle rules, determining eligibility requirements, managing participants, awarding prizes, contacting winners, handling disputes, obtaining required permits, and complying with applicable laws.',
          'Game of Fortunes is not responsible for any organizer-created rules, prizes, representations, or obligations. Any dispute relating to an event, raffle, giveaway, or prize remains the responsibility of the organizer.'
        ]
      },
      {
        heading: 'Participant Responsibilities',
        paragraphs: [
          'Participants are responsible for providing accurate information, following organizer rules, verifying eligibility requirements, and complying with applicable laws.',
          'Game of Fortunes is not responsible for disputes regarding prizes, winners, eligibility decisions, or organizer conduct.'
        ]
      },
      {
        heading: 'Acceptable Use',
        paragraphs: [
          'You agree not to violate any law or regulation, use the platform for unlawful activities, upload harmful software or malware, interfere with platform operations, attempt unauthorized access, abuse or harass other users, use the platform for fraudulent purposes, or misrepresent information.',
          'We reserve the right to suspend or terminate accounts that violate these rules.'
        ]
      },
      {
        heading: 'Subscription Plans and Payments',
        paragraphs: [
          'Certain features may require a paid subscription. Subscription pricing and available features are displayed within the Service.',
          'Payments may be processed through third-party providers such as PayPal or other approved payment processors. By purchasing a subscription, you agree that fees will be charged as displayed at checkout, prices may change in the future, applicable taxes may apply, and access to premium features may end when a subscription expires or is canceled. Unless otherwise required by law, all payments are non-refundable.'
        ]
      },
      {
        heading: 'Service Availability',
        paragraphs: [
          'We strive to provide reliable access to the Service but do not guarantee uninterrupted availability. The Service may occasionally become unavailable due to scheduled maintenance, emergency maintenance, system upgrades, security updates, software deployments, technical failures, internet disruptions, infrastructure issues, third-party service interruptions, configuration problems, domain or DNS issues, SSL certificate issues, hosting provider outages, or newly discovered software bugs or defects.',
          'Features may be modified, suspended, replaced, or removed at any time without prior notice.'
        ]
      },
      {
        heading: 'Third-Party Dependencies',
        paragraphs: [
          'The Service relies on various third-party providers and infrastructure services to operate, including cloud hosting providers, authentication providers, database providers, domain providers, DNS services, SSL certificate authorities, payment processors, and security services.',
          'Users acknowledge that interruptions, outages, delays, or technical issues affecting third-party services may impact the availability of Game of Fortunes. Game of Fortunes is not responsible for service disruptions caused by third-party providers or circumstances beyond our reasonable control.'
        ]
      },
      {
        heading: 'Software Bugs and Technical Issues',
        paragraphs: [
          'Users acknowledge that software systems may occasionally contain bugs, errors, defects, unexpected behavior, or compatibility issues.',
          'While reasonable efforts are made to test, maintain, and improve the platform, Game of Fortunes does not guarantee that the Service will always be error-free, bug-free, continuous, or uninterrupted. The discovery of software defects or newly introduced issues shall not create liability for Game of Fortunes.'
        ]
      },
      {
        heading: 'Intellectual Property',
        paragraphs: [
          'The platform, software, branding, design, logos, features, and content developed by Game of Fortunes are owned by or licensed to us and protected by intellectual property laws.',
          'Users may not copy, redistribute, reverse engineer, modify, or resell any portion of the Service without written authorization.'
        ]
      },
      {
        heading: 'Disclaimer of Warranties',
        paragraphs: [
          'The Service is provided on an "AS IS" and "AS AVAILABLE" basis. To the fullest extent permitted by law, Game of Fortunes disclaims all warranties, whether expressed or implied, including merchantability, fitness for a particular purpose, reliability, availability, accuracy, and non-infringement.',
          'We do not guarantee that the Service will always be available, secure, uninterrupted, or free from defects.'
        ]
      },
      {
        heading: 'Limitation of Liability',
        paragraphs: [
          'To the maximum extent permitted by law, Game of Fortunes shall not be liable for any lost profits, lost revenue, lost business opportunities, lost participants, lost raffle entries, lost prizes, lost data, service interruptions, delays, system outages, domain issues, DNS issues, hosting outages, software bugs, technical failures, or third-party service interruptions.',
          'This limitation applies even if Game of Fortunes has been advised of the possibility of such damages. Your use of the Service is entirely at your own risk.'
        ]
      },
      {
        heading: 'Suspension and Termination',
        paragraphs: [
          'We reserve the right to suspend, restrict, or terminate accounts that violate these Terms, present security risks, engage in fraudulent activities, harm other users, or use the Service unlawfully.',
          'Termination may occur with or without prior notice when necessary.'
        ]
      },
      {
        heading: 'Privacy',
        paragraphs: [
          'Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and processing of information as described in the Privacy Policy.'
        ]
      },
      {
        heading: 'Governing Law',
        paragraphs: [
          'These Terms shall be governed by and interpreted in accordance with the laws of the Republic of the Philippines. Any disputes arising from the use of the Service shall be subject to the appropriate courts located in the Philippines.'
        ]
      },
      {
        heading: 'Changes to These Terms',
        paragraphs: [
          'We may modify these Terms at any time. Updated versions will be posted on this page together with a revised Last Updated date.',
          'Continued use of the Service after such updates constitutes acceptance of the revised Terms.'
        ]
      },
      {
        heading: 'Contact Information',
        paragraphs: [
          'For questions regarding these Terms and Conditions, contact Game of Fortunes, operated by Tovrika Technologies Inc., at gameoffortunes777@gmail.com or visit https://www.gameoffortunes.com/.'
        ]
      }
    ]
  }
};

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss'
})
export class LegalPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly raffleService = inject(RaffleService);
  readonly document: LegalDocument;
  readonly maxMessageLength = 500;
  contactEmail = '';
  contactMessage = '';
  captchaAnswer = '';
  captchaValue = 0;
  contactSubmitting = false;
  contactStatus = '';
  contactStatusType: 'success' | 'error' | '' = '';

  constructor() {
    const page = this.route.snapshot.data['page'] as keyof typeof documents | undefined;
    this.document = page ? documents[page] : documents.privacy;

    this.raffleService.user$.subscribe((user) => {
      if (user && !this.contactEmail) {
        this.contactEmail = user.email ?? '';
      }
    });

    this.resetCaptcha();
  }

  get isContactPage(): boolean {
    return this.document.title === 'Contact';
  }

  private resetCaptcha(): void {
    const left = Math.floor(Math.random() * 8) + 2;
    const right = Math.floor(Math.random() * 7) + 1;
    this.captchaValue = left + right;
    this.captchaAnswer = '';
  }

  async submitContact(): Promise<void> {
    const email = this.contactEmail.trim();
    const message = this.contactMessage.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailPattern.test(email)) {
      this.contactStatus = 'Please enter a valid email address.';
      this.contactStatusType = 'error';
      return;
    }

    if (!message) {
      this.contactStatus = 'Please enter a message.';
      this.contactStatusType = 'error';
      return;
    }

    if (message.length > this.maxMessageLength) {
      this.contactStatus = 'Your message must be 500 characters or fewer.';
      this.contactStatusType = 'error';
      return;
    }

    if (Number(this.captchaAnswer) !== this.captchaValue) {
      this.contactStatus = 'The captcha answer is incorrect.';
      this.contactStatusType = 'error';
      return;
    }

    this.contactSubmitting = true;
    this.contactStatus = '';
    this.contactStatusType = '';

    try {
      const signedInUser = await firstValueFrom(this.raffleService.user$);
      await this.raffleService.submitContactMessage({
        email,
        message,
        userId: signedInUser?.uid ?? null,
        displayName: signedInUser?.displayName ?? null,
      });

      this.contactStatus = 'Thanks! Your message was sent successfully.';
      this.contactStatusType = 'success';
      this.contactEmail = signedInUser?.email ?? '';
      this.contactMessage = '';
      this.captchaAnswer = '';
      this.resetCaptcha();
    } catch (error) {
      this.contactStatus = error instanceof Error ? error.message : 'We could not send your message right now. Please try again later.';
      this.contactStatusType = 'error';
    } finally {
      this.contactSubmitting = false;
    }
  }
}