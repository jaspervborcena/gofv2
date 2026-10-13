import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LegalPageComponent } from './legal-page.component';

describe('LegalPageComponent', () => {
  async function createPage(page: string): Promise<ComponentFixture<LegalPageComponent>> {
    await TestBed.configureTestingModule({
      imports: [LegalPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LegalPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the About page without a draft notice', async () => {
    const fixture = await createPage('about');

    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('About Game of Fortunes');
    expect(fixture.nativeElement.querySelector('.draft-notice')).toBeNull();
  });

  it('renders Contact with the support email link', async () => {
    const fixture = await createPage('contact');
    const emailLink = fixture.nativeElement.querySelector('a[href="mailto:gameoffortunes777@gmail.com"]');

    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Contact');
    expect(emailLink).not.toBeNull();
  });

  it('renders launch-ready Privacy and Terms pages without draft notices', async () => {
    const privacyFixture = await createPage('privacy');
    expect(privacyFixture.nativeElement.querySelector('.draft-notice')).toBeNull();
    privacyFixture.destroy();
    TestBed.resetTestingModule();

    const termsFixture = await createPage('terms');
    expect(termsFixture.nativeElement.querySelector('.draft-notice')).toBeNull();
    termsFixture.destroy();
    TestBed.resetTestingModule();
  });
});