import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
})

export async function sendOtp(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"Captain Shitbag" <${process.env.SMTP_FROM}>`,
    to,
    subject: `Your aux code: ${code}`,
    text: `Your one-time sign-in code is: ${code}\n\nExpires in 10 minutes. If you didn't request this, ignore it.`,
  })
}

export async function sendRegistrationNotification(applicantEmail: string): Promise<void> {
  await transporter.sendMail({
    from: `"Captain Shitbag" <${process.env.SMTP_FROM}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `aux access request: ${applicantEmail}`,
    text: `New access request from: ${applicantEmail}\n\nSign in to aux to review it:\nhttps://app.ourhardy.com/aux`,
  })
}

export async function sendApprovalEmail(to: string): Promise<void> {
  await transporter.sendMail({
    from: `"Captain Shitbag" <${process.env.SMTP_FROM}>`,
    to,
    subject: `aux access approved`,
    text: `Your request for access to aux has been approved.\n\nSign in at https://app.ourhardy.com/aux`,
  })
}

export async function sendInviteEmail(to: string): Promise<void> {
  await transporter.sendMail({
    from: `"Captain Shitbag" <${process.env.SMTP_FROM}>`,
    to,
    subject: `you've been added to aux`,
    text: `You've been granted access to aux.\n\nSign in at https://app.ourhardy.com/aux`,
  })
}
