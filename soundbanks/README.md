# soundbanks/

Bancos de sonido open-source para el **render de MP3** (instrumentos realistas por pista).

Los ficheros de audio **no se versionan** (ver `.gitignore`): se descargan **una vez** y se
ordenan aquí. Solo `README.md` y `manifest.json` están en git.

## Estructura

```
soundbanks/
  manifest.json     ← catálogo (id, motor, licencia, URL de origen…)  [versionado]
  README.md         ← este fichero                                     [versionado]
  sf2/              ← SoundFonts SF2/SF3  (motor FluidSynth)           [ignorado]
  sfz/<id>/         ← librerías SFZ       (motor sfizz)                [ignorado]
  licenses/<id>.txt ← texto de licencia de cada paquete                [ignorado]
```

## Descargar (a mano, una vez)

```bash
# Solo la base (MuseScore General, ~38 MB, MIT) — recomendado para empezar:
scripts/fetch-soundbanks.sh

# Un paquete concreto del manifest por id:
scripts/fetch-soundbanks.sh vcsl salamander-grand

# Todos los que tengan descarga automática (pueden ser muchos GB):
scripts/fetch-soundbanks.sh --all
```

Los paquetes con `"download": null` en el manifest se descargan **manualmente** desde su
`source` y se colocan en la carpeta `dest_dir` indicada (el script imprime las instrucciones).

## Montaje

El directorio se monta **de solo lectura** en los contenedores como `/soundbanks`
(ver `docker-compose.yml`, variable `SOUNDBANKS_DIR`). Al descargar en el host, los
contenedores lo ven sin reconstruir nada.

## Licencias / atribución

Cada paquete conserva su licencia en `licenses/<id>.txt`. Los marcados con
`attribution_required: true` (CC-BY y similares) **exigen crédito**: deben aparecer en la
página de créditos de la app y en los metadatos del MP3 exportado. Verificar **siempre** la
licencia por paquete antes de usar o empaquetar (especialmente Karoryfer y los FreePats
con licencia GPL). Ver `docs/AUDIO_EXPORT.md`.
