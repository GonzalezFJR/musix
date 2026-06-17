import { Logger } from '@coderline/alphatab/Logger';
import { ScoreExporter } from '@coderline/alphatab/exporter/ScoreExporter';
import { IOHelper } from '@coderline/alphatab/io/IOHelper';
import type { Beat } from '@coderline/alphatab/model/Beat';
import { Clef } from '@coderline/alphatab/model/Clef';
import { Duration } from '@coderline/alphatab/model/Duration';
import type { MasterBar } from '@coderline/alphatab/model/MasterBar';
import type { Score } from '@coderline/alphatab/model/Score';
import type { Track } from '@coderline/alphatab/model/Track';
import { ZipEntry } from '@coderline/alphatab/zip/ZipEntry';
import { ZipWriter } from '@coderline/alphatab/zip/ZipWriter';

/**
 * This ScoreExporter writes MuseScore 4 files (.mscz).
 *
 * It serializes the core musical content (parts/staves, measures, notes, rests,
 * durations, dots, tuplets, ties, time/key signatures, clefs and tempo) of the
 * alphaTab model into a MuseScore 4 `.mscx` document, packed into the `.mscz`
 * zip container (with `META-INF/container.xml`). Effects that have no MuseScore 4
 * counterpart in this core mapping are omitted.
 *
 * @public
 */
export class MuseScoreExporter extends ScoreExporter {
    private static readonly Division = 480;

    public get name(): string {
        return 'MuseScore 4';
    }

    public writeScore(score: Score): void {
        Logger.debug(this.name, 'Building MuseScore document');
        const mscx = this._buildMscx(score);

        Logger.debug(this.name, 'Writing ZIP entries');
        const container =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<container>\n  <rootfiles>\n' +
            '    <rootfile full-path="score.mscx"/>\n' +
            '  </rootfiles>\n</container>\n';

        const fileSystem = new ZipWriter(this.data);
        fileSystem.writeEntry(new ZipEntry('META-INF/container.xml', IOHelper.stringToBytes(container)));
        fileSystem.writeEntry(new ZipEntry('score.mscx', IOHelper.stringToBytes(mscx)));
        fileSystem.end();
    }

    private _buildMscx(score: Score): string {
        const sb: string[] = [];
        sb.push('<?xml version="1.0" encoding="UTF-8"?>');
        sb.push('<museScore version="4.20">');
        sb.push('  <Score>');
        sb.push(`    <Division>${MuseScoreExporter.Division}</Division>`);

        // meta tags
        this._pushMetaTag(sb, 'workTitle', score.title);
        this._pushMetaTag(sb, 'subtitle', score.subTitle);
        this._pushMetaTag(sb, 'composer', score.music || score.artist);
        this._pushMetaTag(sb, 'lyricist', score.words);
        this._pushMetaTag(sb, 'copyright', score.copyright);

        // assign a unique staff id to every (track, staff) pair
        const staffIds = new Map<string, number>();
        let nextStaffId = 1;
        for (const track of score.tracks) {
            for (let s = 0; s < track.staves.length; s++) {
                staffIds.set(`${track.index}:${s}`, nextStaffId++);
            }
        }

        // part definitions
        for (const track of score.tracks) {
            this._pushPart(sb, track, staffIds);
        }

        // music staves
        for (const track of score.tracks) {
            for (let s = 0; s < track.staves.length; s++) {
                const id = staffIds.get(`${track.index}:${s}`)!;
                this._pushMusicStaff(sb, score, track, s, id);
            }
        }

        sb.push('  </Score>');
        sb.push('</museScore>');
        return sb.join('\n');
    }

    private _pushMetaTag(sb: string[], name: string, value: string): void {
        if (value) {
            sb.push(`    <metaTag name="${name}">${MuseScoreExporter._escape(value)}</metaTag>`);
        }
    }

    private _pushPart(sb: string[], track: Track, staffIds: Map<string, number>): void {
        sb.push('    <Part>');
        for (let s = 0; s < track.staves.length; s++) {
            const id = staffIds.get(`${track.index}:${s}`)!;
            sb.push(`      <Staff id="${id}">`);
            sb.push('        <StaffType group="pitched">');
            sb.push('          <name>stdNormal</name>');
            sb.push('        </StaffType>');
            sb.push('      </Staff>');
        }
        sb.push(`      <trackName>${MuseScoreExporter._escape(track.name || 'Instrument')}</trackName>`);
        sb.push('      <Instrument>');
        if (track.name) {
            sb.push(`        <longName>${MuseScoreExporter._escape(track.name)}</longName>`);
        }
        if (track.shortName) {
            sb.push(`        <shortName>${MuseScoreExporter._escape(track.shortName)}</shortName>`);
        }
        sb.push('        <Channel>');
        sb.push(`          <program value="${track.playbackInfo.program}"/>`);
        sb.push('        </Channel>');
        sb.push('      </Instrument>');
        sb.push('    </Part>');
    }

    private _pushMusicStaff(sb: string[], score: Score, track: Track, staffIndex: number, id: number): void {
        const staff = track.staves[staffIndex];
        sb.push(`    <Staff id="${id}">`);

        let prevTimeNum = -1;
        let prevTimeDen = -1;
        let prevKey = Number.NaN;
        let prevClef = -1;

        for (let b = 0; b < score.masterBars.length; b++) {
            const masterBar = score.masterBars[b];
            const bar = staff.bars[b];
            sb.push('      <Measure>');

            for (let v = 0; v < bar.voices.length; v++) {
                const voice = bar.voices[v];
                sb.push('        <voice>');

                // measure-level attributes only on the first voice
                if (v === 0) {
                    if (
                        masterBar.timeSignatureNumerator !== prevTimeNum ||
                        masterBar.timeSignatureDenominator !== prevTimeDen
                    ) {
                        sb.push('          <TimeSig>');
                        sb.push(`            <sigN>${masterBar.timeSignatureNumerator}</sigN>`);
                        sb.push(`            <sigD>${masterBar.timeSignatureDenominator}</sigD>`);
                        sb.push('          </TimeSig>');
                        prevTimeNum = masterBar.timeSignatureNumerator;
                        prevTimeDen = masterBar.timeSignatureDenominator;
                    }
                    if ((bar.keySignature as number) !== prevKey) {
                        sb.push('          <KeySig>');
                        sb.push(`            <concertKey>${bar.keySignature as number}</concertKey>`);
                        sb.push('          </KeySig>');
                        prevKey = bar.keySignature as number;
                    }
                    if ((bar.clef as number) !== prevClef) {
                        const clef = MuseScoreExporter._clefName(bar.clef);
                        sb.push('          <Clef>');
                        sb.push(`            <concertClefType>${clef}</concertClefType>`);
                        sb.push(`            <transposingClefType>${clef}</transposingClefType>`);
                        sb.push('          </Clef>');
                        prevClef = bar.clef as number;
                    }
                    const tempo = masterBar.tempoAutomations.length > 0 ? masterBar.tempoAutomations[0] : null;
                    if (tempo) {
                        sb.push('          <Tempo>');
                        sb.push(`            <tempo>${(tempo.value / 60).toFixed(6)}</tempo>`);
                        sb.push('            <followText>1</followText>');
                        const text = tempo.text || `♩ = ${Math.round(tempo.value)}`;
                        sb.push(`            <text>${MuseScoreExporter._escape(text)}</text>`);
                        sb.push('          </Tempo>');
                    }
                }

                this._pushVoiceBeats(sb, voice.beats, masterBar);
                sb.push('        </voice>');
            }

            sb.push('      </Measure>');
        }

        sb.push('    </Staff>');
    }

    private _pushVoiceBeats(sb: string[], beats: Beat[], masterBar: MasterBar): void {
        let i = 0;
        while (i < beats.length) {
            const beat = beats[i];

            // group consecutive beats that share the same tuplet ratio
            if (beat.hasTuplet && beat.tupletNumerator > 0) {
                let j = i;
                while (
                    j < beats.length &&
                    beats[j].hasTuplet &&
                    beats[j].tupletNumerator === beat.tupletNumerator &&
                    beats[j].tupletDenominator === beat.tupletDenominator
                ) {
                    j++;
                }
                sb.push('          <Tuplet>');
                sb.push(`            <normalNotes>${beat.tupletDenominator}</normalNotes>`);
                sb.push(`            <actualNotes>${beat.tupletNumerator}</actualNotes>`);
                sb.push(`            <baseNote>${MuseScoreExporter._durationName(beat.duration)}</baseNote>`);
                sb.push('          </Tuplet>');
                for (let k = i; k < j; k++) {
                    this._pushBeat(sb, beats[k], masterBar);
                }
                // `<endTuplet/>` is a sibling of the chords/rests, at the voice level
                sb.push('          <endTuplet/>');
                i = j;
            } else {
                this._pushBeat(sb, beat, masterBar);
                i++;
            }
        }
    }

    private _pushBeat(sb: string[], beat: Beat, masterBar: MasterBar): void {
        const durationType = MuseScoreExporter._durationName(beat.duration);

        if (beat.isRest) {
            sb.push('          <Rest>');
            if (beat.isFullBarRest) {
                sb.push('            <durationType>measure</durationType>');
                sb.push(
                    `            <duration>${masterBar.timeSignatureNumerator}/${masterBar.timeSignatureDenominator}</duration>`
                );
            } else {
                sb.push(`            <durationType>${durationType}</durationType>`);
                if (beat.dots > 0) {
                    sb.push(`            <dots>${beat.dots}</dots>`);
                }
            }
            sb.push('          </Rest>');
            return;
        }

        sb.push('          <Chord>');
        sb.push(`            <durationType>${durationType}</durationType>`);
        if (beat.dots > 0) {
            sb.push(`            <dots>${beat.dots}</dots>`);
        }
        for (const note of beat.notes) {
            const pitch = note.realValue;
            sb.push('            <Note>');
            if (note.isTieOrigin) {
                sb.push('              <Spanner type="Tie">');
                sb.push('                <next>');
                sb.push('                  <location>');
                sb.push('                    <fractions>1/1</fractions>');
                sb.push('                  </location>');
                sb.push('                </next>');
                sb.push('              </Spanner>');
            }
            if (note.isTieDestination) {
                sb.push('              <Spanner type="Tie">');
                sb.push('                <prev>');
                sb.push('                  <location>');
                sb.push('                    <fractions>-1/1</fractions>');
                sb.push('                  </location>');
                sb.push('                </prev>');
                sb.push('              </Spanner>');
            }
            sb.push(`              <pitch>${pitch}</pitch>`);
            sb.push(`              <tpc>${MuseScoreExporter._tpc(pitch)}</tpc>`);
            sb.push('            </Note>');
        }
        sb.push('          </Chord>');
    }

    // --- static helpers -------------------------------------------------

    private static _escape(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private static _clefName(clef: Clef): string {
        switch (clef) {
            case Clef.F4:
                return 'F';
            case Clef.C3:
                return 'C3';
            case Clef.C4:
                return 'C4';
            case Clef.Neutral:
                return 'PERC';
            default:
                return 'G';
        }
    }

    private static _durationName(duration: Duration): string {
        switch (duration) {
            case Duration.QuadrupleWhole:
                return 'longa';
            case Duration.DoubleWhole:
                return 'breve';
            case Duration.Whole:
                return 'whole';
            case Duration.Half:
                return 'half';
            case Duration.Quarter:
                return 'quarter';
            case Duration.Eighth:
                return 'eighth';
            case Duration.Sixteenth:
                return '16th';
            case Duration.ThirtySecond:
                return '32nd';
            case Duration.SixtyFourth:
                return '64th';
            case Duration.OneHundredTwentyEighth:
                return '128th';
            case Duration.TwoHundredFiftySixth:
                return '256th';
            default:
                return 'quarter';
        }
    }

    /**
     * Tonal pitch class for a MIDI pitch using a natural/sharp spelling.
     * (C=14, G=15, D=16, A=17, E=18, B=19, F#=20, C#=21, G#=22, D#=23, A#=24, F=13)
     */
    private static _tpc(pitch: number): number {
        const map = [14, 21, 16, 23, 18, 13, 20, 15, 22, 17, 24, 19];
        const semitone = ((pitch % 12) + 12) % 12;
        return map[semitone];
    }
}
