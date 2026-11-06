// Sends the site's emails (for now only the password reset) through Resend (resend.com, free up to 3000 a month).
// Needs RESEND_API_KEY and EMAIL_FROM ("Trivially <no-responder@tu-dominio.com>", a domain verified in Resend) in the
// server's variables. Without them, on a developer's computer the email is printed in the console instead; in
// production `mailConfigured()` is false and the site says it can't send emails yet.

export function mailConfigured(env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The password reset email: who it's for, and the link. */
export function resetEmail({ name, link }) {
  const hello = name ? `Hola, ${name}:` : "Hola:";
  const text = [
    hello,
    "",
    "Alguien (esperamos que tú) pidió cambiar la contraseña de tu cuenta de Trivially.",
    "Para elegir una nueva, abre este enlace. Sirve una sola vez y durante 30 minutos:",
    "",
    link,
    "",
    "Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111">
<p>${escapeHtml(hello)}</p>
<p>Alguien (esperamos que tú) pidió cambiar la contraseña de tu cuenta de Trivially. Para elegir una nueva, toca el botón. Sirve una sola vez y durante 30 minutos.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffd60a;color:#111;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">Elegir una contraseña nueva</a></p>
<p style="color:#555;font-size:14px">Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.</p>
</div>`;
  return { subject: "Cambia tu contraseña de Trivially", text, html };
}

/** Sends an email; throws if it couldn't. */
export async function sendMail({ to, subject, text, html }, env = process.env) {
  if (!mailConfigured(env)) {
    console.log(`[Correo] (sin RESEND_API_KEY, no se manda) Para ${to}: ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
}
