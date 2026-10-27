import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCreateWhatsAppTemplatePayload } from '../src/modules/whatsapp/whatsappAutomation.service.js';

test('builds the WhatsApp template approval payload expected by the create API', () => {
  const payload = buildCreateWhatsAppTemplatePayload({
    outletId: 'uefD786xcJf9DxgLUm0U',
    templateName: 'lead_welcome_test',
    languageCode: 'en',
    messageBody:
      'Hello {{1}}, welcome to {{2}}. We received your requirement: {{3}}. Thank you!',
    headerText: 'Welcome!',
    footerText: 'Sensible Connect Solutions Pvt Ltd',
    buttonText: 'Visit Our Website',
    buttonUrl: 'https://m.9m.io/{{1}}',
    buttonUrlExample: 'https://sensible.biz/home',
    triggerEvent: 'LEAD_CREATED',
    name: 'New Lead Welcome Message',
    recipientType: 'CUSTOMER',
    parameterMapping: {
      body_1: '{{customerName}}',
      body_2: '{{businessName}}',
      body_3: '{{requirement}}',
    },
    id: 'default-lead_created-1',
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  });

  assert.deepEqual(payload, {
    outletId: 'uefD786xcJf9DxgLUm0U',
    template_name: 'lead_welcome_test',
    language: 'en',
    category: 'UTILITY',
    button_url: true,
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Welcome!',
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, welcome to {{2}}. We received your requirement: {{3}}. Thank you!',
        example: {
          body_text: [['Ritesh', 'Sensible Connect', 'CRM software']],
        },
      },
      {
        type: 'FOOTER',
        text: 'Sensible Connect Solutions Pvt Ltd',
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Visit Our Website',
            url: 'https://m.9m.io/{{1}}',
            example: ['https://sensible.biz/home'],
          },
        ],
      },
    ],
    name: 'New Lead Welcome Message',
    recipientType: 'CUSTOMER',
    triggerEvent: 'new_lead',
    parameterMapping: {
      1: 'customerName',
      2: 'businessName',
      3: 'requirement',
    },
    isActive: true,
  });
});
