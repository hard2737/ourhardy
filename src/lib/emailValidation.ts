import { promises as dns } from "dns"

// Known disposable / throwaway email providers
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
  "grr.la", "sharklasers.com", "spam4.me",
  "trashmail.com", "trashmail.at", "trashmail.io", "trashmail.me", "trashmail.net",
  "yopmail.com", "yopmail.fr", "fakeinbox.com", "dispostable.com",
  "maildrop.cc", "tempr.email", "tempail.com", "tempinbox.com",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "minutemail.com",
  "temp-mail.org", "tempmail.com", "tempmail.net", "tmailinator.com",
  "mailnull.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spammotel.com", "mytrashmail.com", "throwam.com", "throwam.net",
  "filzmail.com", "getairmail.com", "mailnew.com", "crazymailing.com",
  "dudmail.com", "kurzepost.de", "objectmail.com", "rejectmail.me",
  "safetymail.info", "spam.la", "spamavert.com", "spambob.net", "spambob.org",
  "spambox.info", "spambox.us", "spamcannon.com", "spamcannon.net",
  "spamcon.org", "spamhole.com", "spamify.com", "spammail.me",
  "spamspot.com", "spamthis.co.uk", "spamtroll.net",
  "trashdevil.com", "trashdevil.de", "trayna.com",
  "yep.it", "zehnminutenmail.de", "zippymail.info",
])

// Patterns that suggest a bot or throwaway local-part
function looksLikeBot(localPart: string): boolean {
  // 6+ consecutive digits (e.g. user123456789)
  if (/\d{6,}/.test(localPart)) return true
  // Looks like a hex hash (10+ hex chars)
  if (/^[a-f0-9]{10,}$/i.test(localPart)) return true
  // Entirely digits with maybe one letter
  if (/^\d+[a-z]?\d*$/i.test(localPart)) return true
  return false
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}

export async function validateRegistrationEmail(email: string): Promise<ValidationResult> {
  const atIndex = email.lastIndexOf("@")
  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1).toLowerCase()

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "Disposable email addresses are not accepted." }
  }

  if (looksLikeBot(localPart)) {
    return { ok: false, reason: "Email address does not appear valid." }
  }

  // MX record check — confirm the domain can receive mail
  try {
    const records = await dns.resolveMx(domain)
    if (!records || records.length === 0) {
      return { ok: false, reason: "Email domain has no mail server." }
    }
  } catch {
    return { ok: false, reason: "Email domain could not be verified." }
  }

  return { ok: true }
}
