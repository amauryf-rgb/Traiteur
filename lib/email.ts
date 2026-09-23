// Envoi transactionnel via l'API REST de Resend directement (fetch, pas de
// SDK) — cohérent avec le reste du projet, qui évite une dépendance dès
// qu'un appel HTTP simple suffit (voir lib/payments/simulate.ts pour la
// même philosophie côté paiement). RESEND_API_KEY et EMAIL_FROM doivent être
// configurées dans l'environnement (Netlify + .env local), jamais en dur ici.
export type EmailAttachment = { filename: string; content: Buffer };

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
};

// Best-effort : ne lève jamais — un email qui échoue ne doit jamais faire
// échouer la création de la commande qui l'a déclenché (voir createOrder
// dans app/[slug]/[type]/actions.ts, appelé après le commit de la
// transaction, jamais dedans). Retourne false pour que l'appelant puisse
// journaliser sans planter.
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.error("sendEmail: RESEND_API_KEY ou EMAIL_FROM manquant — email non envoyé.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!response.ok) {
      console.error("sendEmail: Resend a répondu", response.status, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendEmail: échec de l'appel Resend", err);
    return false;
  }
}

// Une adresse email simple, suffisant pour décider d'envoyer ou non — le
// champ orders.client_contact accepte librement un email OU un téléphone
// (voir RecapitulatifClient.tsx), donc toute commande n'a pas forcément une
// adresse exploitable.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
