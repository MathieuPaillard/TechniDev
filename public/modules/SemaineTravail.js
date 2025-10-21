function _parseYYYYMMDD(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function _isoWeekInfo(date) {
  if (!(date instanceof Date)) return null;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return { week, year };
}

class SemaineTravail {
  constructor(numeroSemaine, annee, jours) {
    this.numeroSemaine = Number(numeroSemaine);
    this.annee = Number(annee);
    this.jours = Array.isArray(jours) ? jours.slice() : [];
  }

  get id() {
    const w = String(this.numeroSemaine).padStart(2, "0");
    return `${this.annee}-semaine ${w}`;
  }

  static correspond(jourTravail, numeroSemaine, annee) {
    if (!jourTravail || !jourTravail.date) return false;
    const d = _parseYYYYMMDD(jourTravail.date);
    if (!d) return false;
    const info = _isoWeekInfo(d);
    if (!info) return false;
    return Number(info.week) === Number(numeroSemaine) && Number(info.year) === Number(annee);
  }

  addJour(jourTravail) {
    if (SemaineTravail.correspond(jourTravail, this.numeroSemaine, this.annee)) {
      this.jours.push(jourTravail);
      return true;
    }
    return false;
  }

  static creerDepuisJours(jours, numeroSemaine, annee) {
    const s = new SemaineTravail(numeroSemaine, annee);
    if (Array.isArray(jours)) {
      for (const j of jours) s.addJour(j);
    }
    return s;
  }

  totaux() {
    const toNum = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
    const acc = {
      compteur_presence: 0,
      compteur_tot: 0,
      compteur_effectif: 0,
      compteur_theorique: 0,
      compteur_nuit: 0,
    };
    for (const j of this.jours) {
      acc.compteur_presence += toNum(j.compteur_presence);
      acc.compteur_tot += toNum(j.compteur_tot);
      acc.compteur_effectif += toNum(j.compteur_effectif);
      acc.compteur_theorique += toNum(j.compteur_theorique);
      acc.compteur_nuit += toNum(j.compteur_nuit);
    }
    return acc;
  }
}

if (typeof window !== "undefined") {
  window.SemaineTravail = SemaineTravail;
}
