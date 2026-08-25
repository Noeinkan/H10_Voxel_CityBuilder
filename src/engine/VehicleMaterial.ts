import { DoubleSide, FrontSide, ShaderMaterial, type IUniform } from 'three';
import { vehicleFragmentShader, vehicleVertexShader } from './shaders/vehicle.glsl';
import { wakeFragmentShader, wakeVertexShader } from './shaders/wake.glsl';

/**
 * I materiali dei mezzi e della loro scia.
 *
 * **Non hanno un solo uniform proprio, ed e' il punto.** Prendono in prestito
 * quelli del materiale del voxel — gli stessi oggetti `{ value }`, non delle
 * copie — quindi `setAtmosphere`, `setPalette`, `setShadow` e `setTime` valgono
 * per tutti e tre i programmi con una scrittura sola. Non e' un'economia di
 * righe: e' l'unico modo di garantire che una nave e la costa dietro di lei
 * vedano **lo stesso** sole alla stessa ora. Un secondo elenco di uniform da
 * tenere allineato sarebbe un secondo elenco che diverge, e il difetto si
 * vedrebbe come un mezzo illuminato da mezzogiorno dentro una notte — che e'
 * precisamente il difetto da cui questo lavoro e' partito.
 *
 * **Da qui una regola che non e' negoziabile:** un uniform nuovo in uno di questi
 * shader va dichiarato nel materiale del voxel, o `share` lo rifiuta alla
 * costruzione invece di lasciarlo a zero fino a uno screenshot.
 */

/**
 * Gli uniform che il sorgente dichiara, presi in prestito dal materiale del voxel.
 *
 * Legge i nomi **dal GLSL** invece di ripeterli in un elenco: un elenco a mano si
 * sfasa dal sorgente al primo uniform aggiunto, e in un materiale nessuno se ne
 * accorge — non c'e' un errore di compilazione, c'e' un valore che resta zero.
 */
function share(source: string, from: Record<string, IUniform>): Record<string, IUniform> {
  const picked: Record<string, IUniform> = {};
  for (const match of source.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)) {
    const name = match[1];
    const uniform = from[name];
    if (uniform === undefined) {
      throw new Error(`uniform ${name}: il materiale del voxel non lo dichiara`);
    }
    picked[name] = uniform;
  }
  return picked;
}

/** Il materiale delle sagome: uno solo per tutti i tipi, la tinta la porta il vertice. */
export function createVehicleMaterial(shared: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vehicleVertexShader,
    fragmentShader: vehicleFragmentShader,
    uniforms: share(`${vehicleVertexShader}\n${vehicleFragmentShader}`, shared),
    side: FrontSide,
    transparent: false,
  });
}

/**
 * Il materiale della schiuma.
 *
 * Non scrive profondita': i segni si sovrappongono, e uno che nascondesse quello
 * sotto si vedrebbe come un ritaglio invece che come schiuma. La legge ancora,
 * quindi una scia dietro un molo resta dietro il molo.
 *
 * `DoubleSide` perche' un rettangolo appoggiato sull'acqua e' una superficie
 * sola: non c'e' un volume da chiudere, quindi non c'e' overdraw da pagare, e in
 * cambio la schiuma non sparisce se un giorno la camera scendera' sotto il pelo
 * dell'acqua.
 */
export function createWakeMaterial(shared: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: wakeVertexShader,
    fragmentShader: wakeFragmentShader,
    uniforms: share(`${wakeVertexShader}\n${wakeFragmentShader}`, shared),
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}
