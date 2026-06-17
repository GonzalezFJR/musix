import { ScoreImporter } from '@coderline/alphatab/importer/ScoreImporter';
import { UnsupportedFormatError } from '@coderline/alphatab/importer/UnsupportedFormatError';
import { IOHelper } from '@coderline/alphatab/io/IOHelper';
import { Automation, AutomationType } from '@coderline/alphatab/model/Automation';
import { Bar } from '@coderline/alphatab/model/Bar';
import { Beat } from '@coderline/alphatab/model/Beat';
import { Clef } from '@coderline/alphatab/model/Clef';
import { Duration } from '@coderline/alphatab/model/Duration';
import { KeySignature } from '@coderline/alphatab/model/KeySignature';
import { KeySignatureType } from '@coderline/alphatab/model/KeySignatureType';
import { MasterBar } from '@coderline/alphatab/model/MasterBar';
import { ModelUtils } from '@coderline/alphatab/model/ModelUtils';
import { Note } from '@coderline/alphatab/model/Note';
import { Score } from '@coderline/alphatab/model/Score';
import { Staff } from '@coderline/alphatab/model/Staff';
import { Track } from '@coderline/alphatab/model/Track';
import { Voice } from '@coderline/alphatab/model/Voice';
import { XmlDocument } from '@coderline/alphatab/xml/XmlDocument';
import type { XmlNode } from '@coderline/alphatab/xml/XmlNode';
import type { ZipEntry } from '@coderline/alphatab/zip/ZipEntry';
import { ZipReader } from '@coderline/alphatab/zip/ZipReader';

/**
 * Maps a music `<Staff id="N">` to the track and staff index it belongs to,
 * derived from the `<Part>` definitions.
 */
class StaffMapping {
    public track: Track;
    public staffIndex: number;
    public constructor(track: Track, staffIndex: number) {
        this.track = track;
        this.staffIndex = staffIndex;
    }
}

/**
 * This ScoreImporter can read MuseScore 4 files (.mscz and uncompressed .mscx).
 *
 * It targets the MuseScore 4 schema (`<museScore version="4.x">`) but is tolerant
 * enough to import the common subset of MuseScore 3 files too. It maps the core
 * musical content (parts/staves, measures, notes, rests, durations, dots, tuplets,
 * ties, time/key signatures, clefs and tempo) to the alphaTab model. Advanced and
 * format-specific features are ignored without breaking the import.
 *
 * @internal
 */
export class MuseScoreImporter extends ScoreImporter {
    private _score!: Score;
    // maps a MuseScore staff id -> the alphaTab track/staff it renders into
    private _staffMap: Map<string, StaffMapping> = new Map<string, StaffMapping>();

    public get name(): string {
        return 'MuseScore';
    }

    public readScore(): Score {
        const root = this._loadRootElement();
        if (!root || root.localName !== 'museScore') {
            throw new UnsupportedFormatError('Not a MuseScore file');
        }

        const scoreNode = root.findChildElement('Score');
        if (!scoreNode) {
            throw new UnsupportedFormatError('MuseScore file without <Score>');
        }

        this._score = new Score();

        this._parseScoreNode(scoreNode);

        ModelUtils.consolidate(this._score);
        this._score.finish(this.settings);
        this._score.rebuildRepeatGroups();
        return this._score;
    }

    /**
     * Extracts the `.mscx` XML (from the .mscz zip or from raw bytes) and parses it.
     */
    private _loadRootElement(): XmlNode | null {
        const xml = this._extractMscx();
        const dom = new XmlDocument();
        try {
            dom.parse(xml);
        } catch (e) {
            throw new UnsupportedFormatError('Unsupported format', e as Error);
        }
        return dom.firstElement;
    }

    private _extractMscx(): string {
        const zip = new ZipReader(this.data, this.settings.importer.maxDecodingBufferSize);
        let entries: ZipEntry[];
        try {
            entries = zip.read();
        } catch {
            entries = [];
        }

        // not zipped -> treat the raw bytes as an uncompressed .mscx
        if (entries.length === 0) {
            this.data.reset();
            return IOHelper.toString(this.data.readAll(), this.settings.importer.encoding);
        }

        // prefer the rootfile declared in META-INF/container.xml
        const container = entries.find(e => e.fullName === 'META-INF/container.xml');
        if (container) {
            const containerDom = new XmlDocument();
            try {
                containerDom.parse(IOHelper.toString(container.data, this.settings.importer.encoding));
                const rootFiles = containerDom.firstElement?.findChildElement('rootfiles');
                if (rootFiles) {
                    for (const c of rootFiles.childElements()) {
                        if (c.localName === 'rootfile') {
                            const path = c.getAttribute('full-path');
                            if (path && path.endsWith('.mscx')) {
                                const file = entries.find(e => e.fullName === path);
                                if (file) {
                                    return IOHelper.toString(file.data, this.settings.importer.encoding);
                                }
                            }
                        }
                    }
                }
            } catch {
                // fall through to the heuristic lookup
            }
        }

        // fallback: any top-level .mscx entry
        const mscx = entries.find(e => e.fullName.endsWith('.mscx'));
        if (!mscx) {
            throw new UnsupportedFormatError('No .mscx found in MuseScore container');
        }
        return IOHelper.toString(mscx.data, this.settings.importer.encoding);
    }

    private _parseScoreNode(scoreNode: XmlNode): void {
        // first pass: divisions, meta tags and part/instrument definitions
        for (const c of scoreNode.childElements()) {
            switch (c.localName) {
                case 'metaTag':
                    this._parseMetaTag(c);
                    break;
                case 'Part':
                    this._parsePart(c);
                    break;
            }
        }

        // second pass: the actual music lives in top-level <Staff id="N"> siblings
        for (const c of scoreNode.childElements()) {
            if (c.localName === 'Staff') {
                this._parseMusicStaff(c);
            }
        }

        // make sure every track has at least one staff/bar so the model is valid
        if (this._score.tracks.length === 0) {
            const track = new Track();
            track.ensureStaveCount(1);
            this._score.addTrack(track);
        }
        if (this._score.masterBars.length === 0) {
            this._appendMasterBar();
            for (const track of this._score.tracks) {
                for (const staff of track.staves) {
                    const bar = new Bar();
                    bar.addVoice(new Voice());
                    staff.addBar(bar);
                }
            }
        }
    }

    private _parseMetaTag(node: XmlNode): void {
        const name = node.getAttribute('name');
        const value = node.innerText ?? '';
        if (!value) {
            return;
        }
        switch (name) {
            case 'workTitle':
                this._score.title = value;
                break;
            case 'subtitle':
            case 'subTitle':
                this._score.subTitle = value;
                break;
            case 'composer':
                this._score.music = value;
                if (!this._score.artist) {
                    this._score.artist = value;
                }
                break;
            case 'lyricist':
            case 'poet':
                this._score.words = value;
                break;
            case 'copyright':
                this._score.copyright = value;
                break;
            case 'arranger':
                if (!this._score.artist) {
                    this._score.artist = value;
                }
                break;
        }
    }

    private _parsePart(partNode: XmlNode): void {
        const track = new Track();

        const staffIds: string[] = [];
        for (const c of partNode.childElements()) {
            switch (c.localName) {
                case 'Staff':
                    staffIds.push(c.getAttribute('id'));
                    break;
                case 'trackName':
                    track.name = c.innerText ?? track.name;
                    break;
                case 'Instrument':
                    this._parseInstrument(c, track);
                    break;
            }
        }

        const staffCount = Math.max(1, staffIds.length);
        track.ensureStaveCount(staffCount);
        for (const staff of track.staves) {
            // we import concert pitch (standard notation), tablature stays off
            staff.showStandardNotation = true;
            staff.showTablature = false;
            staff.standardNotationLineCount = Staff.DefaultStandardNotationLineCount;
        }

        this._score.addTrack(track);

        for (let i = 0; i < staffIds.length; i++) {
            this._staffMap.set(staffIds[i], new StaffMapping(track, i));
        }
    }

    private _parseInstrument(instrumentNode: XmlNode, track: Track): void {
        for (const c of instrumentNode.childElements()) {
            switch (c.localName) {
                case 'longName':
                    if (!track.name) {
                        track.name = c.innerText ?? '';
                    }
                    break;
                case 'shortName':
                    track.shortName = c.innerText ?? track.shortName;
                    break;
                case 'Channel': {
                    const program = c.findChildElement('program');
                    if (program) {
                        track.playbackInfo.program = MuseScoreImporter._int(program.getAttribute('value'), 0);
                    }
                    break;
                }
            }
        }
    }

    private _parseMusicStaff(staffNode: XmlNode): void {
        const id = staffNode.getAttribute('id');
        let mapping = this._staffMap.get(id);
        if (!mapping) {
            // no matching <Part> (rare) -> create a fallback single-staff track
            const track = new Track();
            track.ensureStaveCount(1);
            track.staves[0].showTablature = false;
            this._score.addTrack(track);
            mapping = new StaffMapping(track, 0);
        }

        const staff = mapping.track.staves[mapping.staffIndex];
        // master bars are owned globally; only the first staff we ever read fills them.
        const fillMasterBars = this._score.masterBars.length === 0;

        // carried-over musical state (MuseScore only re-emits these on change)
        let currentTimeNum = 4;
        let currentTimeDen = 4;
        let currentKey = KeySignature.C;
        let currentClef = Clef.G2;

        let measureIndex = 0;
        for (const measureNode of staffNode.childElements()) {
            if (measureNode.localName !== 'Measure') {
                continue;
            }

            let masterBar: MasterBar;
            if (fillMasterBars) {
                masterBar = this._appendMasterBar();
                masterBar.timeSignatureNumerator = currentTimeNum;
                masterBar.timeSignatureDenominator = currentTimeDen;
            } else {
                masterBar =
                    this._score.masterBars[measureIndex] ?? this._appendMasterBar();
            }

            const bar = new Bar();
            bar.clef = currentClef;
            bar.keySignature = currentKey;
            bar.keySignatureType = KeySignatureType.Major;

            this._parseMeasure(measureNode, bar, masterBar, fillMasterBars, {
                setTime: (n, d) => {
                    currentTimeNum = n;
                    currentTimeDen = d;
                    if (fillMasterBars) {
                        masterBar.timeSignatureNumerator = n;
                        masterBar.timeSignatureDenominator = d;
                    }
                },
                setKey: k => {
                    currentKey = k;
                    bar.keySignature = k;
                },
                setClef: cl => {
                    currentClef = cl;
                    bar.clef = cl;
                },
                timeNum: () => currentTimeNum,
                timeDen: () => currentTimeDen
            });

            staff.addBar(bar);
            measureIndex++;
        }
    }

    private _parseMeasure(
        measureNode: XmlNode,
        bar: Bar,
        masterBar: MasterBar,
        fillMasterBars: boolean,
        ctx: {
            setTime: (n: number, d: number) => void;
            setKey: (k: KeySignature) => void;
            setClef: (c: Clef) => void;
            timeNum: () => number;
            timeDen: () => number;
        }
    ): void {
        // repeats / barlines live directly under <Measure>
        for (const c of measureNode.childElements()) {
            if (c.localName === 'startRepeat' && fillMasterBars) {
                masterBar.isRepeatStart = true;
            } else if (c.localName === 'endRepeat' && fillMasterBars) {
                masterBar.repeatCount = Math.max(2, MuseScoreImporter._int(c.innerText, 2));
            }
        }

        const voiceNodes = measureNode.getElementsByTagName('voice', false);
        if (voiceNodes.length === 0) {
            // a measure without explicit <voice> still needs one empty voice
            const voice = new Voice();
            this._fillFullBarRest(voice, ctx.timeNum(), ctx.timeDen());
            bar.addVoice(voice);
            return;
        }

        for (const voiceNode of voiceNodes) {
            const voice = new Voice();
            this._parseVoice(voiceNode, voice, masterBar, fillMasterBars, ctx);
            if (voice.beats.length === 0) {
                this._fillFullBarRest(voice, ctx.timeNum(), ctx.timeDen());
            }
            bar.addVoice(voice);
        }
    }

    private _parseVoice(
        voiceNode: XmlNode,
        voice: Voice,
        masterBar: MasterBar,
        fillMasterBars: boolean,
        ctx: {
            setTime: (n: number, d: number) => void;
            setKey: (k: KeySignature) => void;
            setClef: (c: Clef) => void;
            timeNum: () => number;
            timeDen: () => number;
        }
    ): void {
        // active tuplet ratio (actual:normal), -1 means none
        let tupletNum = -1;
        let tupletDen = -1;
        // pitch -> origin note that started a tie waiting to be closed
        const openTies = new Map<number, Note>();

        for (const c of voiceNode.childElements()) {
            switch (c.localName) {
                case 'TimeSig': {
                    const n = MuseScoreImporter._int(c.findChildElement('sigN')?.innerText, ctx.timeNum());
                    const d = MuseScoreImporter._int(c.findChildElement('sigD')?.innerText, ctx.timeDen());
                    ctx.setTime(n, d);
                    break;
                }
                case 'KeySig': {
                    const fifths = MuseScoreImporter._int(
                        c.findChildElement('concertKey')?.innerText ?? c.findChildElement('accidental')?.innerText,
                        0
                    );
                    ctx.setKey(MuseScoreImporter._keySignature(fifths));
                    break;
                }
                case 'Clef':
                    ctx.setClef(MuseScoreImporter._clef(c));
                    break;
                case 'Tempo': {
                    if (fillMasterBars) {
                        const bps = MuseScoreImporter._float(c.findChildElement('tempo')?.innerText, 2);
                        const automation = new Automation();
                        automation.type = AutomationType.Tempo;
                        automation.value = Math.round(bps * 60);
                        automation.ratioPosition = 0;
                        automation.text = c.findChildElement('text')?.innerText ?? '';
                        masterBar.tempoAutomations.push(automation);
                    }
                    break;
                }
                case 'Tuplet': {
                    tupletNum = MuseScoreImporter._int(c.findChildElement('actualNotes')?.innerText, 3);
                    tupletDen = MuseScoreImporter._int(c.findChildElement('normalNotes')?.innerText, 2);
                    break;
                }
                case 'endTuplet':
                    tupletNum = -1;
                    tupletDen = -1;
                    break;
                case 'Chord':
                    voice.addBeat(this._parseChord(c, tupletNum, tupletDen, openTies));
                    break;
                case 'Rest':
                    this._parseRest(c, voice, tupletNum, tupletDen, ctx);
                    break;
            }
        }
    }

    private _parseChord(
        chordNode: XmlNode,
        tupletNum: number,
        tupletDen: number,
        openTies: Map<number, Note>
    ): Beat {
        const beat = new Beat();
        beat.duration = MuseScoreImporter._duration(chordNode.findChildElement('durationType')?.innerText);
        beat.dots = MuseScoreImporter._int(chordNode.findChildElement('dots')?.innerText, 0);
        if (tupletNum > 0) {
            beat.tupletNumerator = tupletNum;
            beat.tupletDenominator = tupletDen;
        }

        for (const c of chordNode.childElements()) {
            if (c.localName === 'Note') {
                const note = this._parseNote(c, openTies);
                if (note) {
                    beat.addNote(note);
                }
            }
        }
        return beat;
    }

    private _parseNote(noteNode: XmlNode, openTies: Map<number, Note>): Note | null {
        const pitchText = noteNode.findChildElement('pitch')?.innerText;
        if (pitchText === undefined || pitchText === null || pitchText === '') {
            return null;
        }
        const midi = MuseScoreImporter._int(pitchText, 60);
        const note = new Note();
        note.octave = (midi / 12) | 0;
        note.tone = midi - note.octave * 12;

        // close a tie that ended on this pitch
        const pendingTie = openTies.get(midi);
        if (pendingTie) {
            note.isTieDestination = true;
            note.tieOrigin = pendingTie;
            pendingTie.tieDestination = note;
            openTies.delete(midi);
        }

        // does this note start a tie forward?
        for (const spanner of noteNode.getElementsByTagName('Spanner', false)) {
            if (spanner.getAttribute('type') === 'Tie' && spanner.findChildElement('next')) {
                openTies.set(midi, note);
            }
        }

        return note;
    }

    private _parseRest(
        restNode: XmlNode,
        voice: Voice,
        tupletNum: number,
        tupletDen: number,
        ctx: { timeNum: () => number; timeDen: () => number }
    ): void {
        const durationType = restNode.findChildElement('durationType')?.innerText;
        // a full-measure rest -> expand to one rest beat per beat of the bar so the
        // timing stays correct for any time signature
        if (durationType === 'measure' || !durationType) {
            this._fillFullBarRest(voice, ctx.timeNum(), ctx.timeDen());
            return;
        }

        const beat = new Beat();
        beat.duration = MuseScoreImporter._duration(durationType);
        beat.dots = MuseScoreImporter._int(restNode.findChildElement('dots')?.innerText, 0);
        if (tupletNum > 0) {
            beat.tupletNumerator = tupletNum;
            beat.tupletDenominator = tupletDen;
        }
        // no notes -> rest
        voice.addBeat(beat);
    }

    private _fillFullBarRest(voice: Voice, timeNum: number, timeDen: number): void {
        const duration = MuseScoreImporter._durationFromDenominator(timeDen);
        for (let i = 0; i < Math.max(1, timeNum); i++) {
            const beat = new Beat();
            beat.duration = duration;
            voice.addBeat(beat);
        }
    }

    private _appendMasterBar(): MasterBar {
        const masterBar = new MasterBar();
        masterBar.timeSignatureNumerator = 4;
        masterBar.timeSignatureDenominator = 4;
        this._score.addMasterBar(masterBar);
        return masterBar;
    }

    // --- static helpers -------------------------------------------------

    private static _int(text: string | null | undefined, fallback: number): number {
        if (text === undefined || text === null || text === '') {
            return fallback;
        }
        const v = Number.parseInt(text, 10);
        return Number.isNaN(v) ? fallback : v;
    }

    private static _float(text: string | null | undefined, fallback: number): number {
        if (text === undefined || text === null || text === '') {
            return fallback;
        }
        const v = Number.parseFloat(text);
        return Number.isNaN(v) ? fallback : v;
    }

    private static _keySignature(fifths: number): KeySignature {
        const clamped = Math.max(-7, Math.min(7, fifths));
        return clamped as KeySignature;
    }

    private static _clef(clefNode: XmlNode): Clef {
        const type =
            clefNode.findChildElement('concertClefType')?.innerText ??
            clefNode.findChildElement('clefType')?.innerText ??
            clefNode.innerText ??
            'G';
        switch (type.toUpperCase()) {
            case 'F':
            case 'F8VB':
            case 'F8VA':
            case 'F15MB':
                return Clef.F4;
            case 'C3':
            case 'C1':
            case 'C2':
                return Clef.C3;
            case 'C4':
            case 'C5':
                return Clef.C4;
            case 'PERC':
            case 'PERC2':
                return Clef.Neutral;
            default:
                return Clef.G2;
        }
    }

    private static _duration(durationType: string | null | undefined): Duration {
        switch ((durationType ?? '').toLowerCase()) {
            case 'long':
            case 'longa':
                return Duration.QuadrupleWhole;
            case 'breve':
                return Duration.DoubleWhole;
            case 'whole':
                return Duration.Whole;
            case 'half':
                return Duration.Half;
            case 'quarter':
                return Duration.Quarter;
            case 'eighth':
                return Duration.Eighth;
            case '16th':
                return Duration.Sixteenth;
            case '32nd':
                return Duration.ThirtySecond;
            case '64th':
                return Duration.SixtyFourth;
            case '128th':
                return Duration.OneHundredTwentyEighth;
            case '256th':
                return Duration.TwoHundredFiftySixth;
            default:
                return Duration.Quarter;
        }
    }

    private static _durationFromDenominator(denominator: number): Duration {
        switch (denominator) {
            case 1:
                return Duration.Whole;
            case 2:
                return Duration.Half;
            case 4:
                return Duration.Quarter;
            case 8:
                return Duration.Eighth;
            case 16:
                return Duration.Sixteenth;
            case 32:
                return Duration.ThirtySecond;
            case 64:
                return Duration.SixtyFourth;
            default:
                return Duration.Quarter;
        }
    }
}
