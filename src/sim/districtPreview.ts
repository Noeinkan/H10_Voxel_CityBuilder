import { BALANCE } from './balance';
import { catalystRoleOf, type CatalystId } from './catalysts';
import { districtOf, districtPairingsOf, type DistrictId, type UrbanSources } from './districts';
import { reachAt, type ReachField } from './reach';
import type { Catalyst } from './DesirabilityField';

/** Il partner indicato al cursore e il risultato effettivo della sovrapposizione. */
export interface DistrictPreview {
  readonly status: 'formed' | 'near' | 'blocked';
  readonly district: DistrictId;
  readonly partner: Catalyst;
  /** Tutti i partner di quartiere in portata geometrica del sito puntato. */
  readonly partners: readonly Catalyst[];
  /** Il quartiere che vince la precedenza quando la coppia si sovrappone. */
  readonly competing?: DistrictId;
}

/**
 * Cerca una cella che diventi davvero il quartiere promesso dal catalogo.
 * La portata del cursore arriva gia' calcolata dall'overlay: la simulazione non
 * deve tenere in cache tutti i siti su cui il mouse e' passato.
 */
export function previewDistrict(
  sources: UrbanSources,
  kind: CatalystId,
  field: ReachField,
): DistrictPreview | null {
  const threshold = BALANCE.districts.overlapThreshold;
  const existing = sources.catalysts.map((catalyst) => ({
    catalyst,
    role: catalystRoleOf(catalyst),
    field: sources.reach.get(catalyst.x, catalyst.y, catalyst.radius),
  }));
  const pairings = districtPairingsOf(kind);
  const partners = existing
    .filter((entry) => pairings.some((pairing) => pairing.partners.includes(entry.role)) &&
      Math.abs(field.cx - entry.field.cx) <= field.radius + entry.field.radius &&
      Math.abs(field.cy - entry.field.cy) <= field.radius + entry.field.radius)
    .map((entry) => entry.catalyst);
  if (partners.length === 0) return null;
  let near: DistrictPreview | null = null;
  let nearGap = Infinity;
  let blocked: DistrictPreview | null = null;

  for (const pairing of pairings) {
    for (const partner of existing) {
      if (!pairing.partners.includes(partner.role)) continue;
      const other = partner.field;
      if (Math.abs(field.cx - other.cx) > field.radius + other.radius ||
        Math.abs(field.cy - other.cy) > field.radius + other.radius) continue;
      // Anche sulla strada migliore ogni passo costa almeno uno: se i centri
      // sono troppo lontani, nessuna cella puo' superare entrambe le soglie.
      const separation = Math.max(Math.abs(field.cx - other.cx), Math.abs(field.cy - other.cy));
      const gap = separation - (field.radius + other.radius) * (1 - threshold);
      if (gap < nearGap) {
        nearGap = gap;
        near = { status: 'near', district: pairing.district, partner: partner.catalyst, partners };
      }
      if (separation >= (field.radius + other.radius) * (1 - threshold)) continue;

      // Oltre questi quadrati il peso e' sotto soglia anche in pianura.
      const candidateSpan = Math.floor(field.radius * (1 - threshold));
      const partnerSpan = Math.floor(other.radius * (1 - threshold));
      const minX = Math.max(field.cx - candidateSpan, other.cx - partnerSpan);
      const maxX = Math.min(field.cx + candidateSpan, other.cx + partnerSpan);
      const minY = Math.max(field.cy - candidateSpan, other.cy - partnerSpan);
      const maxY = Math.min(field.cy + candidateSpan, other.cy + partnerSpan);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const candidateWeight = reachAt(field, x, y);
          if (candidateWeight < threshold || reachAt(other, x, y) < threshold) continue;
          const byRole = new Map<CatalystId, number>([[kind, candidateWeight]]);
          for (const source of existing) {
            const influence = reachAt(source.field, x, y);
            if (influence <= 0) continue;
            byRole.set(source.role, (byRole.get(source.role) ?? 0) + influence);
          }
          const roles = [...byRole]
            .filter(([, influence]) => influence >= threshold)
            .map(([role]) => role);
          const actual = districtOf(roles);
          if (actual === pairing.district) {
            return { status: 'formed', district: pairing.district, partner: partner.catalyst, partners };
          }
          blocked ??= {
            status: 'blocked',
            district: pairing.district,
            partner: partner.catalyst,
            partners,
            competing: actual,
          };
        }
      }
    }
  }
  return blocked ?? near;
}
