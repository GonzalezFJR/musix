// Catálogo de instrumentos General MIDI (128 programas), agrupados por familia.
// Asignar un instrumento a una pista = fijar su `playbackInfo.program`. El
// SoundFont base (MuseScore General) cubre todos los programas GM.
export interface GmInstrument {
  program: number; // 0-127
  name: string;
  family: string;
}

const FAMILIES: [string, string[]][] = [
  ["Piano", ["Piano de cola", "Piano brillante", "Piano eléctrico de cola", "Piano honky-tonk", "Piano eléctrico 1", "Piano eléctrico 2", "Clavecín", "Clavinet"]],
  ["Percusión cromática", ["Celesta", "Glockenspiel", "Caja de música", "Vibráfono", "Marimba", "Xilófono", "Campanas tubulares", "Dulcimer"]],
  ["Órgano", ["Órgano Hammond", "Órgano percusivo", "Órgano de rock", "Órgano de iglesia", "Armonio", "Acordeón", "Armónica", "Acordeón de tango"]],
  ["Guitarra", ["Guitarra de nylon", "Guitarra de acero", "Guitarra eléctrica (jazz)", "Guitarra eléctrica (limpia)", "Guitarra eléctrica (apagada)", "Guitarra overdrive", "Guitarra distorsionada", "Armónicos de guitarra"]],
  ["Bajo", ["Bajo acústico", "Bajo eléctrico (dedos)", "Bajo eléctrico (púa)", "Bajo fretless", "Bajo slap 1", "Bajo slap 2", "Bajo sintético 1", "Bajo sintético 2"]],
  ["Cuerda", ["Violín", "Viola", "Violonchelo", "Contrabajo", "Cuerdas trémolo", "Cuerdas pizzicato", "Arpa", "Timbales"]],
  ["Conjunto", ["Cuerdas conjunto 1", "Cuerdas conjunto 2", "Cuerdas sintéticas 1", "Cuerdas sintéticas 2", "Coro «Aah»", "Voz «Ooh»", "Voz sintética", "Golpe orquestal"]],
  ["Metales", ["Trompeta", "Trombón", "Tuba", "Trompeta con sordina", "Trompa", "Sección de metales", "Metales sintéticos 1", "Metales sintéticos 2"]],
  ["Cañas", ["Saxo soprano", "Saxo alto", "Saxo tenor", "Saxo barítono", "Oboe", "Corno inglés", "Fagot", "Clarinete"]],
  ["Viento", ["Flautín", "Flauta", "Flauta dulce", "Flauta de pan", "Botella soplada", "Shakuhachi", "Silbato", "Ocarina"]],
  ["Synth lead", ["Lead cuadrado", "Lead sierra", "Lead calliope", "Lead chiff", "Lead charang", "Lead voz", "Lead quintas", "Lead bajo+solo"]],
  ["Synth pad", ["Pad new age", "Pad cálido", "Pad polysynth", "Pad coro", "Pad arco", "Pad metálico", "Pad halo", "Pad barrido"]],
  ["Synth efectos", ["FX lluvia", "FX banda sonora", "FX cristal", "FX atmósfera", "FX brillo", "FX duendes", "FX ecos", "FX sci-fi"]],
  ["Étnico", ["Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Gaita", "Fiddle", "Shanai"]],
  ["Percusivo", ["Campana tintineo", "Agogô", "Tambores metálicos", "Tambor de madera", "Tambor taiko", "Tom melódico", "Tambor sintético", "Platillo invertido"]],
  ["Efectos", ["Traste de guitarra", "Respiración", "Orilla del mar", "Canto de pájaros", "Teléfono", "Helicóptero", "Aplausos", "Disparo"]],
];

export const GM_INSTRUMENTS: GmInstrument[] = FAMILIES.flatMap(([family, names], fi) =>
  names.map((name, i) => ({ program: fi * 8 + i, name, family })),
);

export const GM_FAMILY_ORDER: string[] = FAMILIES.map(([f]) => f);

export function gmName(program: number): string {
  return GM_INSTRUMENTS[((program % 128) + 128) % 128]?.name ?? `Programa ${program}`;
}
