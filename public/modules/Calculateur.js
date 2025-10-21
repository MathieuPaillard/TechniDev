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

class Calculateur {
  static _parseDate(dateStr) { return _parseYYYYMMDD(dateStr); }

  static _inferShift(jour) {
    // Heuristics: prefer explicit nuit counter, else codes_horaire keywords
    if (jour && Number(jour.compteur_nuit) > 0) return 'N';
    const ch = (jour && jour.codes_horaire ? String(jour.codes_horaire).toLowerCase() : '');
    if (ch.includes('nuit')) return 'N';
    if (ch.includes('matin')) return 'M';
    if (ch.includes('apres') || ch.includes('apres-midi') || ch.includes('apres midi') || ch.includes('après') || ch.includes('pm') || ch.includes('am')) return 'A';
    return null; // unknown
  }

  static _expectedStartFor(jour) {
    const d = Calculateur._parseDate(jour?.date);
    if (!d) return null;
    let shift = Calculateur._inferShift(jour);
    if (!shift) {
      // fallback: infer from earliest entry time
      const first = Calculateur._firstEntryFor(jour);
      shift = Calculateur._inferShiftFromFirst(first);
      if (!shift) return null;
    }
    // Monday=1 ... Sunday=7 for ISO day
    const dow = (d.getDay() === 0) ? 7 : d.getDay();
    let h = 7, m = 0;
    if (shift === 'M') {
      // Morning: Mon-Thu 07:00, Fri 07:00
      h = 7; m = 0;
    } else if (shift === 'A') {
      // Afternoon: Mon-Thu 15:00, Fri 14:00
      if (dow === 5) { h = 14; m = 0; } else { h = 15; m = 0; }
    } else if (shift === 'N') {
      // Night: Mon-Thu 23:00, Fri 21:00
      if (dow === 5) { h = 21; m = 0; } else { h = 23; m = 0; }
    }
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
    return start;
  }

  static _firstEntryFor(jour) {
    // Try to parse earliest time in mouvements string (HH:MM or HhMM e.g., 6h51)
    const d = Calculateur._parseDate(jour?.date);
    if (!d) return null;
    const text = (jour && jour.mouvements) ? String(jour.mouvements) : '';
    const re = /(\b\d{1,2})\s*[:hH]\s*(\d{2})\b/g;
    let match; let best = null;
    while ((match = re.exec(text)) !== null) {
      let hh = Number(match[1]);
      let mm = Number(match[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) continue;
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      if (best === null || t < best) best = t;
    }
    return best;
  }

  static _inferShiftFromFirst(first) {
    if (!first) return null;
    const hh = first.getHours();
    if (hh >= 5 && hh <= 8) return 'M';
    if (hh >= 12 && hh <= 17) return 'A';
    if (hh >= 20 || hh <= 3) return 'N';
    return null;
  }

  static calculHabillageJour(jour) {
    const start = Calculateur._expectedStartFor(jour);
    const first = Calculateur._firstEntryFor(jour);
    if (!start || !first) return { eligible: false, minutes: 0, minutes_majorees: 0 };
    const deltaMin = (start - first) / 60000; // positive if early
    if (deltaMin >= 9) {
      const minutes = 10;
      const minutes_majorees = minutes * 1.25; // 25% majoration
      return { eligible: true, minutes, minutes_majorees };
    }
    return { eligible: false, minutes: 0, minutes_majorees: 0 };
  }

  static habillageSemaine(semaine) {
    if (!semaine || !Array.isArray(semaine.jours)) return { count: 0, total: 0 };
    let count = 0; let total = 0;
    for (const j of semaine.jours) {
      const r = Calculateur.calculHabillageJour(j);
      if (r.eligible) { count += 1; total += r.minutes_majorees; }
    }
    return { count, total };
  }
  static infoSemainePourJour(jourTravail) {
    if (!jourTravail || !jourTravail.date) return null;
    const d = _parseYYYYMMDD(jourTravail.date);
    if (!d) return null;
    const info = _isoWeekInfo(d);
    if (!info) return null;
    return { numeroSemaine: info.week, annee: info.year };
  }

  static filtrerSemaine(jours, numeroSemaine, annee) {
    if (typeof SemaineTravail === "undefined") {
      throw new Error("SemaineTravail n'est pas charge dans la page");
    }
    return SemaineTravail.creerDepuisJours(jours, numeroSemaine, annee);
  }

  static regrouperParSemaines(jours) {
    if (!Array.isArray(jours)) return new Map();
    if (typeof SemaineTravail === "undefined") {
      throw new Error("SemaineTravail n'est pas charge dans la page");
    }
    const map = new Map();
    for (const j of jours) {
      const info = Calculateur.infoSemainePourJour(j);
      if (!info) continue;
      const key = `${info.annee}-W${String(info.numeroSemaine).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, new SemaineTravail(info.numeroSemaine, info.annee));
      }
      map.get(key).addJour(j);
    }
    return map;
  }

  static listerSemainesTriees(jours) {
    const map = Calculateur.regrouperParSemaines(jours);
    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.annee - b.annee) || (a.numeroSemaine - b.numeroSemaine));
    return arr;
  }

  // --- RTT helpers ---
  static _toHours(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (val >= 0 && val <= 1) return val * 24; // Excel day fraction to hours
      return val;
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
    if (m) {
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if (Number.isFinite(h) && Number.isFinite(mi)) return h + mi / 60;
    }
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  static _isSemaineEquipe(semaine) {
    if (!semaine || !Array.isArray(semaine.jours)) return false;
    for (const j of semaine.jours) {
      let sh = Calculateur._inferShift(j);
      if (!sh) sh = Calculateur._inferShiftFromFirst(Calculateur._firstEntryFor(j));
      if (sh === 'M' || sh === 'A' || sh === 'N') return true;
    }
    return false;
  }

  // --- Heures supplémentaires (VALHS), YHAPAYER et majorations ---
  static _parseCodesHoraireHeures(text, code) {
    if (!text) return 0;
    const s = String(text);
    // Match lines like: "VALHS      H   1:25" or "YHAPAYER   H   7:40" or decimals
    // We search multiple occurrences and sum.
    const re = new RegExp(String(code) + "\\s+H\\s+([0-9]{1,2}\\s*[:hH]\\s*[0-9]{2}|[0-9]+(?:[\\.,][0-9]+)?)", "g");
    let m; let total = 0;
    while ((m = re.exec(s)) !== null) {
      total += Calculateur._toHours(m[1]);
    }
    return total;
  }

  static _valhsJour(jour) {
    return Calculateur._parseCodesHoraireHeures(jour?.codes_horaire, 'VALHS');
  }

  static _yhapayerJour(jour) {
    return Calculateur._parseCodesHoraireHeures(jour?.codes_horaire, 'YHAPAYER');
  }

  static _rehsPosesJour(jour) {
    // Conges posés en récupération heures supplémentaires: "REHS       H   6:30"
    return Calculateur._parseCodesHoraireHeures(jour?.codes_horaire, 'REHS');
  }

  static _xhr00Jour(jour) {
    // Heures globales à ajouter au total global (XHR00      H  XX:XX)
    return Calculateur._parseCodesHoraireHeures(jour?.codes_horaire, 'XHR00');
  }

  static sommeXHR00(jours) {
    if (!Array.isArray(jours)) return 0;
    let total = 0;
    for (const j of jours) total += Calculateur._xhr00Jour(j);
    return total;
  }

  static calculHeuresSupplementairesSemaine(semaine) {
    if (!semaine || !Array.isArray(semaine.jours)) {
      return {
        totalValhs: 0,
        totalYhaPayer: 0,
        rehs: 0,
        effectif: 0,
        seuil: 36.5,
        majoration: { baseEligible: 0, extra: 0, h25: 0, h50: 0, h100: 0 },
      };
    }

    const seuil = 36.5;
    let totalValhs = 0;
    let totalYhaPayer = 0;
    let effectif = 0;
    let rehsPoses = 0;

    // Collect per-day info for later majoration breakdown
    const joursHS = [];
    for (const j of semaine.jours) {
      const v = Calculateur._valhsJour(j);
      const y = Calculateur._yhapayerJour(j);
      totalValhs += v;
      totalYhaPayer += y;
      effectif += Calculateur._toHours(j?.compteur_effectif);
      rehsPoses += Calculateur._rehsPosesJour(j);
      if (v > 0) {
        let rate; // majoration rate for equipe: 0.5 or 1.0; day schedule: 0.25
        const sh = Calculateur._inferShift(j) || Calculateur._inferShiftFromFirst(Calculateur._firstEntryFor(j));
        if (!sh) {
          rate = 0.25; // horaire de journée
        } else if (sh === 'N') {
          rate = 1.0; // 22h-7h
        } else {
          rate = 0.5; // 7h-22h (M, A)
        }
        joursHS.push({ v, rate });
      }
    }

    const rehs = Math.max(0, totalValhs - totalYhaPayer);

    // Majoration only on the portion au-delà de 36.5h,
    // and only for non-paid overtime (REHS), not the fully paid VALHS.
    const excedent = Math.max(0, (effectif + totalValhs) - seuil);
    const baseEligible = Math.min(rehs, excedent);

    let h25 = 0, h50 = 0, h100 = 0;
    if (baseEligible > 0 && joursHS.length > 0) {
      const sumV = joursHS.reduce((a, x) => a + x.v, 0);
      if (sumV > 0) {
        for (const d of joursHS) {
          const share = baseEligible * (d.v / sumV); // proportional allocation
          if (d.rate === 0.25) h25 += share * d.rate;
          else if (d.rate === 0.5) h50 += share * d.rate;
          else if (d.rate === 1.0) h100 += share * d.rate;
          else h25 += share * 0.25; // fallback safe default
        }
      }
    }

    const extra = h25 + h50 + h100; // additional credited hours from majoration
    const rehsMajorees = Math.max(0, rehs + extra);
    const rehsNet = Math.max(0, rehs - rehsPoses);
    const rehsNetMajorees = Math.max(0, rehsMajorees - rehsPoses);

    return {
      totalValhs,
      totalYhaPayer,
      rehs, // brut (sans majoration)
      rehsMajorees, // REHS incluant la majoration
      rehsPoses, // REHS consommées
      rehsNet, // REHS restantes sans majoration
      rehsNetMajorees, // REHS restantes incluant majoration
      effectif,
      seuil,
      majoration: { baseEligible, extra, h25, h50, h100 },
    };
  }

  // --- Presentation helpers ---
  static formatHeures(h) {
    const n = (typeof h === 'number' && Number.isFinite(h)) ? h : (Number(String(h).replace(',', '.')) || 0);
    const sign = n < 0 ? '-' : '';
    const totalMin = Math.round(Math.abs(n) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  }

  static calculRTTSemaine(semaine) {
    if (!semaine || !Array.isArray(semaine.jours)) return { equipe: false, heures: 0, excedent: 0, rtt: 0 };
    const equipe = Calculateur._isSemaineEquipe(semaine);
    let heures = 0;
    for (const j of semaine.jours) {
      heures += Calculateur._toHours(j?.compteur_effectif);
    }
    if (!equipe) return { equipe, heures, excedent: 0, rtt: 0 };
    const excedent = Math.max(0, heures - 35);
    const excedentCap = Math.min(excedent, 1.5);
    const rtt = excedentCap * 1.25; // 25% majoration
    return { equipe, heures, excedent: excedentCap, rtt };
  }
}

if (typeof window !== "undefined") {
  window.Calculateur = Calculateur;
}
