import nodemailer from 'nodemailer';
import { resolveMetadata, type ScopeContext } from '../../metadata-service.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

/**
 * Resolves SMTP Configuration based on Scope Hierarchy (Branch > Business > Tenant > System/Env).
 */
export async function resolveSmtpConfig(db: any, context: ScopeContext): Promise<SmtpConfig | null> {
  // 1. Try to resolve metadata key 'smtp_config' from DB
  try {
    const meta = await resolveMetadata(db, 'smtp_config', context);
    if (meta?.revision?.payload) {
      const payload = meta.revision.payload as Record<string, any>;
      if (payload.host && payload.port && payload.from) {
        return {
          host: payload.host,
          port: Number(payload.port),
          secure: payload.secure ?? false,
          auth: payload.user && payload.pass ? {
            user: payload.user,
            pass: payload.pass,
          } : undefined,
          from: payload.from,
        };
      }
    }
  } catch (err: any) {
    console.error('[EmailProvider] Failed to resolve SMTP config from metadata:', err.message);
  }

  // 2. Fallback to System environment variables
  const envHost = process.env['SMTP_HOST'];
  const envPort = process.env['SMTP_PORT'];
  const envSecure = process.env['SMTP_SECURE'];
  const envUser = process.env['SMTP_USER'];
  const envPass = process.env['SMTP_PASS'];
  const envFrom = process.env['SMTP_FROM'];

  if (envHost && envPort && envFrom) {
    return {
      host: envHost,
      port: Number(envPort),
      secure: envSecure === 'true' || envSecure === '1',
      auth: envUser && envPass ? {
        user: envUser,
        pass: envPass,
      } : undefined,
      from: envFrom,
    };
  }

  return null;
}

/**
 * Sends an email using nodemailer with the resolved or passed SMTP configuration.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  config: SmtpConfig
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    html,
  });
}
