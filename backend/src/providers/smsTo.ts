const DEFAULT_SMS_TO_BASE_URL = 'https://api.sms.to';
const SEND_SMS_PATH = '/sms/send';

function getSmsToApiKey(): string {
  const apiKey = process.env.SMS_TO_API_KEY;
  if (!apiKey) {
    throw new Error('SMS_TO_API_KEY is required');
  }
  return apiKey;
}

function getSmsToBaseUrl(): string {
  const configured = (process.env.SMS_TO_API_BASE_URL || '').trim();
  return (configured || DEFAULT_SMS_TO_BASE_URL).replace(/\/+$/, '');
}

export async function sendSms(toE164: string, message: string): Promise<void> {
  const apiKey = getSmsToApiKey();
  const url = `${getSmsToBaseUrl()}${SEND_SMS_PATH}`;

  // Endpoint and payload follow SMS.to "Send single message" docs.
  // Docs: https://docs.sms.to/api/ and support references:
  // https://support.sms.to/support/solutions/articles/43000515639-sms-api
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: toE164,
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SMS.to send failed (${response.status}): ${body || 'unknown error'}`);
  }
}
