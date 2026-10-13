import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';

interface ContactRequest {
  email?: string;
  message?: string;
  userId?: string | null;
  displayName?: string | null;
}

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  async send(@Body() body: ContactRequest): Promise<{ success: true; message: string }> {
    return await this.contactService.send(body);
  }
}