/* ============================================================
   langue.js — accords et élisions
   ------------------------------------------------------------
   Le français ne se laisse pas concaténer : « la guerre à Empire
   russe », « Bataille de Île-de-France ». Ces quelques fonctions
   rendent leur article aux noms propres. Pour les puissances,
   l'article est une donnée (champ `article` de data/empires.js) ;
   pour les provinces, la règle d'élision suffit.
   ============================================================ */

/** Un nom qui commence par une voyelle (ou un h muet) élide l'article. */
export function commenceParVoyelle(nom) {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(nom);
}

/** « d'Île-de-France », « de Bourgogne ». */
export function prepositionDe(nom) {
  return commenceParVoyelle(nom) ? "d'" : 'de ';
}

/** « l'Empire français », « le Royaume-Uni », « les États-Unis ». */
export function avecArticle(empire) {
  const article = empire.article ?? 'le';
  return article === "l'" ? `l'${empire.nom}` : `${article} ${empire.nom}`;
}

/** « à l'Empire français », « au Royaume-Uni », « aux États-Unis ». */
export function datif(empire) {
  const article = empire.article ?? 'le';
  if (article === 'le') return `au ${empire.nom}`;
  if (article === 'les') return `aux ${empire.nom}`;
  if (article === 'la') return `à la ${empire.nom}`;
  return `à l'${empire.nom}`;
}

/** « de l'Empire français », « du Royaume-Uni », « des États-Unis ». */
export function genitif(empire) {
  const article = empire.article ?? 'le';
  if (article === 'le') return `du ${empire.nom}`;
  if (article === 'les') return `des ${empire.nom}`;
  if (article === 'la') return `de la ${empire.nom}`;
  return `de l'${empire.nom}`;
}
