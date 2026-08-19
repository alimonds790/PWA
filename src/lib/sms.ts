// SMS abstraction (brief §6): the real implementation will be a local
// Egyptian aggregator, configured by env — never Twilio. v1 ships only the
// console provider; see COMPLIANCE.md §B6 before any real deployment.

export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, message: string): Promise<void> {
    console.log(`[sms → ${phone}] ${message}`);
  }
}

export function smsProvider(): SmsProvider {
  // switch on process.env.SMS_PROVIDER when a real aggregator is added
  return new ConsoleSmsProvider();
}
