// CSV minimal, sans dépendance — un champ contenant une virgule, un
// guillemet ou un retour à la ligne est entre guillemets, avec les
// guillemets internes doublés (RFC 4180). Suffisant pour un export simple ;
// si un vrai .xlsx (plusieurs feuilles, mise en forme) est demandé plus
// tard, cette fonction reste inchangée — seul un nouveau renderer s'ajoute
// à côté, construit sur les mêmes lignes de données.
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number): string => {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers, ...rows].map((line) => line.map(escape).join(","));
  return lines.join("\n");
}
