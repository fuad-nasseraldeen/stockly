import { sendTransactionalEmail } from '../lib/mailer.js';
import { sendSms } from '../providers/smsTo.js';

type PurchaseNotificationInput = {
  customerEmail?: string | null;
  customerPhoneE164?: string | null;
  tenantName: string;
  planName: string;
  validFrom: string;
  validUntil: string;
};

function formatPlanName(planName: string): string {
  if (planName === 'monthly_199') return 'חודשי (₪199)';
  if (planName === 'annual_49') return 'שנתי מראש (₪1,788)';
  return planName;
}

function buildEmailText(input: PurchaseNotificationInput): string {
  const planLabel = formatPlanName(input.planName);
  return [
    'תודה על הרכישה ב-Stockly.',
    '',
    `חנות: ${input.tenantName}`,
    `מסלול: ${planLabel}`,
    `תאריך התחלה: ${input.validFrom}`,
    `תאריך חידוש/סיום תקופה נוכחית: ${input.validUntil}`,
    '',
    'התשלום הבא יתבצע אוטומטית לפי מחזור החיוב של Stripe, אלא אם בוטל לפני מועד החידוש.',
  ].join('\n');
}

function buildOwnerEmailText(input: PurchaseNotificationInput): string {
  const planLabel = formatPlanName(input.planName);
  return [
    'התבצעה רכישת מנוי חדשה ב-Stockly.',
    '',
    `חנות: ${input.tenantName}`,
    `מסלול: ${planLabel}`,
    `תאריך התחלה: ${input.validFrom}`,
    `תאריך חידוש/סיום תקופה נוכחית: ${input.validUntil}`,
    `מייל לקוח: ${input.customerEmail || 'לא זמין'}`,
    `טלפון לקוח: ${input.customerPhoneE164 || 'לא זמין'}`,
  ].join('\n');
}

function buildSmsText(input: PurchaseNotificationInput): string {
  const planLabel = formatPlanName(input.planName);
  return `Stockly: רכישת מנוי אושרה. חנות: ${input.tenantName}, מסלול: ${planLabel}, תקופה נוכחית עד ${input.validUntil}.`;
}

export async function sendSubscriptionPurchaseNotifications(input: PurchaseNotificationInput): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  const ownerEmail = (process.env.CONTACT_RECEIVER_EMAIL || '').trim().toLowerCase();
  const customerEmail = (input.customerEmail || '').trim().toLowerCase();
  const supportPhone = (process.env.SUPPORT_SMS_TO || '').trim();
  const customerPhone = (input.customerPhoneE164 || '').trim();

  if (customerEmail) {
    jobs.push(
      sendTransactionalEmail({
        to: customerEmail,
        subject: 'Stockly - אישור רכישת מנוי',
        text: buildEmailText(input),
      }),
    );
  }

  if (ownerEmail && ownerEmail !== customerEmail) {
    jobs.push(
      sendTransactionalEmail({
        to: ownerEmail,
        subject: 'Stockly - רכישת מנוי חדשה',
        text: buildOwnerEmailText(input),
      }),
    );
  }

  if (customerPhone) {
    jobs.push(sendSms(customerPhone, buildSmsText(input)));
  }

  if (supportPhone && supportPhone !== customerPhone) {
    jobs.push(
      sendSms(
        supportPhone,
        `Stockly: רכישת מנוי חדשה. חנות: ${input.tenantName}, מסלול: ${formatPlanName(input.planName)}, עד ${input.validUntil}.`,
      ),
    );
  }

  if (jobs.length === 0) return;
  await Promise.allSettled(jobs);
}
