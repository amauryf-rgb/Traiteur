import { ForgotPasswordForm } from "./ForgotPasswordForm";

// Pas de dynamic="force-dynamic" ici, contrairement à /admin/login et
// /admin/setup : cette page ne lit ni cookie ni base de données pendant son
// propre rendu (tout se passe dans l'action déclenchée par le formulaire),
// donc rien n'empêche une prérendue statique correcte.
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
