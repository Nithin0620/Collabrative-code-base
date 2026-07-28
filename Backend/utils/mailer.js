import nodemailer from "nodemailer"

let transporter = null

export function getTransporter() {
  if (transporter) return transporter

  const host = process.env.EMAIL_HOST || "smtp.gmail.com"
  const port = parseInt(process.env.EMAIL_PORT || "587", 10)
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  } else {
    // Development fallback using Ethereal test account or stream logs
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    })
  }

  return transporter
}

export async function sendInviteEmail({ toEmail, inviterName, roomName, roomId, inviteToken, role }) {
  const mailer = getTransporter()
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173"
  const inviteUrl = `${clientUrl}/room/${roomId}?inviteToken=${inviteToken}`

  const mailOptions = {
    from: `"Collaborative Code Editor" <${process.env.EMAIL_USER || "no-reply@collabcode.com"}>`,
    to: toEmail,
    subject: `Invitation to join room "${roomName || roomId}"`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f59e0b; margin-top: 0;">Room Invitation</h2>
        <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">
          <strong>${inviterName || "The room owner"}</strong> has invited you to join the collaborative workspace:
        </p>
        <div style="background-color: #1e293b; padding: 16px; border-radius: 8px; margin: 200px 0; border: 1px solid #334155;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #94a3b8;">Room ID:</p>
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #f8fafc; font-family: monospace;">${roomId}</p>
          <p style="margin: 12px 0 0 0; font-size: 13px; color: #f59e0b;">Role: ${role || "Editor"}</p>
        </div>
        <p style="font-size: 14px; color: #94a3b8;">Click the button below to accept the invitation and start collaborating:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${inviteUrl}" style="background-color: #f59e0b; color: #0f172a; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block; font-size: 15px;">Accept Invitation</a>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">
          If button doesn't work, copy and paste this link in your browser:<br/>
          <a href="${inviteUrl}" style="color: #60a5fa;">${inviteUrl}</a>
        </p>
      </div>
    `,
  }

  try {
    const info = await mailer.sendMail(mailOptions)
    console.log("Invite email sent:", info.messageId || info)
    return { success: true, info }
  } catch (err) {
    console.error("Failed to send invite email:", err)
    return { success: false, error: err.message }
  }
}
