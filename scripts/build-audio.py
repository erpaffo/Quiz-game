"""Genera gli AUDIO PROVVISORI del gioco (da sostituire con i tuoi) e il pacchetto «Melodie famose».
   python scripts/build-audio.py
Richiede: Python 3 + numpy. Facoltativi: ffmpeg (per gli mp3, altrimenti restano wav) e,
su Windows, la voce italiana di sistema (per le battute del presentatore).

Crea:
  client/public/audio/music/*    musiche di sottofondo in loop
  client/public/audio/sfx/*      effetti sonori
  client/public/audio/voice/*    battute del presentatore (sintesi vocale)
  client/public/audio/melodie/*  brani di pubblico dominio per «Indovina il brano»
  client/public/audio/audio.json elenco dei suoni usati dal gioco (modificabile a mano)
  server/data/packs/melodie.json pacchetto di domande con i brani
I brani sono melodie di pubblico dominio (compositori morti da oltre 70 anni o canti tradizionali),
risuonate da zero da questo script: nessuna registrazione esistente viene copiata."""
import json, os, random, re, shutil, subprocess, sys, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'client', 'public', 'audio')
SR = 22050
FFMPEG = shutil.which('ffmpeg')
EXT = '.mp3' if FFMPEG else '.wav'
rng = np.random.default_rng(42)
random.seed(42)


# ------------------------------------------------------------------ scrittura file
def save(path_noext, x, bitrate='96k'):
    """Salva un segnale mono float [-1,1] in mp3 (con ffmpeg) o wav."""
    os.makedirs(os.path.dirname(path_noext), exist_ok=True)
    x = np.asarray(x, dtype=np.float64)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.89
    pcm = (x * 32767).astype('<i2')
    wav_path = path_noext + '.wav'
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    if FFMPEG:
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', wav_path, '-b:a', bitrate, path_noext + '.mp3'], check=True)
        os.remove(wav_path)
    return os.path.basename(path_noext) + EXT


# ------------------------------------------------------------------ sintesi
NOTE_RE = re.compile(r'^([A-G])([#b]?)(-?\d)$')
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def freq(name):
    m = NOTE_RE.match(name)
    if not m:
        raise ValueError(name)
    n = SEMI[m.group(1)] + {'#': 1, 'b': -1, '': 0}[m.group(2)] + (int(m.group(3)) + 1) * 12
    return 440.0 * 2 ** ((n - 69) / 12)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, attack=0.01, release=0.08, decay=None):
    """Inviluppo: attacco lineare, eventuale decadimento esponenziale, rilascio finale."""
    t = np.arange(n) / SR
    e = np.ones(n)
    a = max(1, int(attack * SR))
    e[:a] = np.linspace(0, 1, a)
    if decay:
        e *= np.exp(-t * decay)
    r = min(n, max(1, int(release * SR)))
    e[-r:] *= np.linspace(1, 0, r)
    return e


INSTR = {
    # nome: (armoniche, attacco, decadimento, rilascio, vibrato)
    'piano': ([1, 0.5, 0.3, 0.15, 0.08], 0.005, 2.6, 0.08, 0),
    'organ': ([1, 0.7, 0.45, 0.3, 0.2, 0.1], 0.02, None, 0.1, 0),
    'strings': ([1, 0.55, 0.38, 0.28, 0.2, 0.14, 0.1, 0.07], 0.07, None, 0.15, 5.5),
    'brass': ([1, 0.8, 0.6, 0.45, 0.3, 0.2], 0.03, 0.4, 0.08, 4),
    'bell': ([1, 0.6, 0.0, 0.3, 0.0, 0.15], 0.002, 1.8, 0.2, 0),
    'flute': ([1, 0.18, 0.06], 0.04, None, 0.1, 5),
    'pluck': ([1, 0.4, 0.2, 0.1], 0.003, 5.0, 0.05, 0),
    'bass': ([1, 0.35, 0.1], 0.01, 1.2, 0.06, 0),
    'pad': ([1, 0.3, 0.15, 0.08], 0.25, None, 0.3, 3),
}


def tone(f, dur, instr='piano', gain=1.0):
    harm, att, dec, rel, vib = INSTR[instr]
    t = t_axis(dur)
    phase = 2 * np.pi * f * t
    if vib:
        phase += 0.004 * f / vib * np.sin(2 * np.pi * vib * t) * 2 * np.pi
    y = sum(a * np.sin(phase * (k + 1)) for k, a in enumerate(harm) if a)
    if instr == 'bell':
        y += 0.25 * np.sin(phase * 2.76) * np.exp(-t * 3)
    return y * env(len(t), att, min(rel, dur * 0.4), dec) * gain


def parse_seq(seq):
    out = []
    for tok in seq.split():
        name, beats = tok.split(':')
        out.append((name, float(beats)))
    return out


def render_seq(seq, bpm, instr='piano', gain=1.0, legato=0.92, octave=0):
    beat = 60.0 / bpm
    items = parse_seq(seq)
    total = sum(b for _, b in items) * beat + 0.6
    y = np.zeros(int(total * SR))
    pos = 0.0
    for name, beats in items:
        dur = beats * beat
        if name != 'R':
            f = freq(name) * (2 ** octave)
            s = tone(f, dur * legato + 0.05, instr, gain)
            i = int(pos * SR)
            y[i:i + len(s)] += s[: len(y) - i]
        pos += dur
    return y


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = np.zeros(n)
    for t in tracks:
        out[: len(t)] += t
    return out


# ------------------------------------------------------------------ batteria
def kick(dur=0.35):
    t = t_axis(dur)
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def noise_burst(dur, decay, hp=0.0):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    if hp:  # passa-alto semplice: differenza
        x = np.diff(np.concatenate([[0], x])) * hp + x * (1 - hp)
    return x * np.exp(-np.arange(n) / SR * decay)


def snare():
    return mix(noise_burst(0.2, 18, 0.5) * 0.7, tone(190, 0.12, 'bass', 0.4))


def hat():
    return noise_burst(0.05, 70, 0.95) * 0.35


def place(y, sample, at):
    i = int(at * SR)
    if i >= len(y):
        return
    y[i:i + len(sample)] += sample[: len(y) - i]


# ------------------------------------------------------------------ musiche
CHORDS = {
    'C': ['C', 'E', 'G'], 'Dm': ['D', 'F', 'A'], 'Em': ['E', 'G', 'B'], 'F': ['F', 'A', 'C'],
    'G': ['G', 'B', 'D'], 'Am': ['A', 'C', 'E'], 'Bb': ['Bb', 'D', 'F'], 'Gm': ['G', 'Bb', 'D'],
    'E': ['E', 'G#', 'B'], 'D': ['D', 'F#', 'A'], 'Fm': ['F', 'Ab', 'C'], 'Ab': ['Ab', 'C', 'Eb'], 'Eb': ['Eb', 'G', 'Bb'],
}


def music_track(bpm, progression, style):
    """Loop di 2 giri della progressione (4/4): basso, accordi, arpeggio e batteria."""
    beat = 60 / bpm
    bars = progression * 2
    total = len(bars) * 4 * beat
    y = np.zeros(int(total * SR) + SR)
    for b, ch in enumerate(bars):
        start = b * 4 * beat
        notes = CHORDS[ch]
        # accordo tenuto
        pad_instr = 'pad' if style in ('lobby', 'final') else 'organ'
        for k, n in enumerate(notes):
            place(y, tone(freq(f'{n}4'), 4 * beat, pad_instr, 0.13 if style != 'victory' else 0.1), start)
        # basso
        steps = 8 if style in ('game', 'tension') else 4
        for s in range(steps):
            n = notes[0] if s % 4 != 3 else notes[2]
            place(y, tone(freq(f'{n}2'), beat * 4 / steps * 0.9, 'bass', 0.55), start + s * beat * 4 / steps)
        # arpeggio / melodia
        if style == 'game':
            for s in range(16):
                n = notes[[0, 1, 2, 1][s % 4]]
                octv = 5 if s % 8 < 4 else 4
                place(y, tone(freq(f'{n}{octv}'), beat / 4, 'pluck', 0.28), start + s * beat / 4)
        elif style == 'lobby':
            for s in range(8):
                n = notes[[0, 2, 1, 2][s % 4]]
                place(y, tone(freq(f'{n}5'), beat / 2, 'bell', 0.16), start + s * beat / 2)
        elif style == 'tension':
            for s in range(8):
                place(y, tone(freq(f'{notes[0]}5'), beat / 4, 'pluck', 0.12 if s % 2 else 0.2), start + s * beat / 2)
        elif style == 'final':
            for s, n in enumerate([notes[0], notes[1], notes[2], notes[1]]):
                place(y, tone(freq(f'{n}4'), beat * 0.95, 'strings', 0.22), start + s * beat)
            place(y, tone(freq(f'{notes[0]}3'), beat * 1.5, 'brass', 0.25), start)
        elif style == 'victory':
            for s, n in enumerate([notes[0], notes[1], notes[2], notes[0]]):
                octv = 5 if s == 3 else 4
                place(y, tone(freq(f'{n}{octv}'), beat * 0.9, 'brass', 0.3), start + s * beat)
        # batteria
        for s in range(4):
            if style != 'lobby' or s % 2 == 0:
                place(y, kick() * (0.9 if style != 'lobby' else 0.5), start + s * beat)
            if s % 2 == 1 and style != 'tension':
                place(y, snare() * 0.6, start + s * beat)
            for h in range(2):
                place(y, hat() * (1 if style != 'lobby' else 0.6), start + s * beat + h * beat / 2)
        if style == 'tension':
            for s in range(4):
                place(y, tone(2200, 0.03, 'pluck', 0.12), start + s * beat)  # tic-tac
    return y[: int(total * SR)]


MUSIC = {
    'lobby': (100, ['C', 'Am', 'F', 'G'], 'lobby'),
    'game': (128, ['C', 'G', 'Am', 'F'], 'game'),
    'tension': (92, ['Am', 'F', 'G', 'Am'], 'tension'),
    'final': (108, ['Dm', 'Bb', 'F', 'C'], 'final'),
    'victory': (120, ['C', 'F', 'G', 'C'], 'victory'),
}


# ------------------------------------------------------------------ effetti
def sweep(f0, f1, dur, instr='flute', gain=1.0):
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.005, dur * 0.3) * gain


def seq_fx(notes, step, instr, gain=1.0, dur=None):
    y = np.zeros(int((len(notes) * step + (dur or step) + 0.2) * SR))
    for i, n in enumerate(notes):
        place(y, tone(freq(n), dur or step * 1.4, instr, gain), i * step)
    return y


def sfx_all():
    return {
        'tick': tone(1600, 0.06, 'pluck'),
        'pop': sweep(500, 1100, 0.14),
        'join': seq_fx(['C5', 'E5', 'G5'], 0.07, 'bell'),
        'whoosh': noise_burst(0.5, 4, 0.7) * env(int(0.5 * SR), 0.15, 0.2),
        'question': sweep(300, 900, 0.3) * 0.8,
        'reveal': mix(*[np.concatenate([np.zeros(int(i * 0.06 * SR)), noise_burst(0.06, 30) * (0.9 - i * 0.07)]) for i in range(10)]),
        'correct': seq_fx(['C5', 'E5', 'G5', 'C6'], 0.08, 'bell'),
        'wrong': mix(sweep(180, 110, 0.5, 'flute'), 0.4 * sweep(185, 112, 0.5, 'flute')),
        'coin': seq_fx(['E6', 'A6'], 0.07, 'pluck'),
        'shield': mix(sweep(660, 990, 0.25), noise_burst(0.15, 20, 0.95) * 0.4),
        'boom': mix(noise_burst(1.2, 3) * 1.2, tone(70, 0.9, 'bass')),
        'spin': mix(*[np.concatenate([np.zeros(int(((i / 16) ** 2) * 3.1 * SR)), tone(900, 0.03, 'pluck')]) for i in range(16)]),
        'fanfare': mix(seq_fx(['C5', 'C5', 'C5', 'E5', 'G5', 'E5', 'G5', 'C6'], 0.17, 'brass', 0.8), seq_fx(['C4', 'C4', 'C4', 'E4', 'G4', 'E4', 'G4', 'C5'], 0.17, 'brass', 0.5)),
        'hit_ice': mix(noise_burst(0.35, 12, 0.95), seq_fx(['C7', 'E7', 'G7'], 0.05, 'bell', 0.5)),
        'hit_goo': mix(sweep(220, 70, 0.4), np.concatenate([np.zeros(int(0.08 * SR)), sweep(160, 60, 0.3) * 0.7])),
        'hit_bomb': mix(noise_burst(0.7, 6), tone(90, 0.5, 'bass')),
        'hit_lock': seq_fx(['A6', 'E6'], 0.09, 'pluck'),
        'card': mix(noise_burst(0.12, 30, 0.8) * 0.6, sweep(800, 1200, 0.1) * 0.4),
        'climb': seq_fx(['C5', 'D5', 'E5', 'G5'], 0.06, 'pluck'),
        'sabotage': seq_fx(['E4', 'C4', 'A3'], 0.12, 'brass', 0.8),
        'steal': seq_fx(['G5', 'E5', 'C5'], 0.06, 'pluck'),
    }


# ------------------------------------------------------------------ battute del presentatore
def voice_lines(brand):
    return {
        'welcome': [f"Benvenuti a {brand}! Inquadrate il codice con il telefono per entrare in gioco."],
        'player_join': ["Un nuovo concorrente!", "Benvenuto in studio!", "Ecco un altro sfidante!"],
        'start': ["Si comincia! Che vinca il più sapiente!"],
        'wheel': ["Giriamo la ruota!", "Vediamo che gioco esce!"],
        'game_classic': ["Il classico! Votate la categoria."],
        'game_fastest': ["Il più veloce! Solo il primo vince."],
        'game_bomb': ["Bomba a orologeria! Attenti alla miccia."],
        'game_steal': ["Ruba punti! Rispondete giusto e derubate gli avversari."],
        'game_wager': ["Scommessa! Quanto vi fidate di voi stessi?"],
        'game_blitz': ["Raffica! Quarantacinque secondi, via!"],
        'game_estimate': ["La stima! Avvicinatevi il più possibile."],
        'game_clues': ["Indizio dopo indizio! Prima rispondete, più punti vincete."],
        'game_music': ["Indovina il brano! Ascoltate bene."],
        'cards': ["Giocate le vostre carte!", "È il momento delle carte!"],
        'hit': ["Colpito!", "Che attacco!", "Ahia!"],
        'blocked': ["Parato!", "Difesa perfetta!"],
        'question': ["Ecco la domanda.", "Attenzione alla domanda!", "Pronti? Domanda!"],
        'last_seconds': ["Ultimi secondi!"],
        'correct': ["Esatto!", "Risposta giusta!", "Bravissimi!"],
        'wrong': ["Peccato!", "Risposta sbagliata!"],
        'nobody': ["Nessuno ha indovinato!"],
        'leaderboard': ["Ecco la classifica!", "Vediamo come siete messi!"],
        'boom': ["Boom! La bomba è esplosa!"],
        'steal': ["Che furto!"],
        'joker': ["Joker! La scelta è fatta."],
        'final': ["È il momento della finale: la piramide della conoscenza!"],
        'sabotage': ["Gli ultimi in classifica preparano un sabotaggio!"],
        'climb': ["Si sale!", "Un gradino più su!"],
        'winner': ["Abbiamo un vincitore! Complimenti!"],
        'restart': ["Si ricomincia!"],
    }


def build_voices(lines):
    """Sintesi vocale con la voce italiana di Windows (System.Speech). Restituisce {chiave: [file]}."""
    if os.name != 'nt':
        print('Voci: sintesi disponibile solo su Windows, salto.')
        return {}
    voice_dir = os.path.join(OUT, 'voice')
    os.makedirs(voice_dir, exist_ok=True)
    jobs = []
    for key, texts in lines.items():
        for i, text in enumerate(texts, 1):
            jobs.append({'file': os.path.join(voice_dir, f'{key}-{i}.wav'), 'text': text})
    tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
    json.dump(jobs, tmp, ensure_ascii=False)
    tmp.close()
    ps = r"""
Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -Encoding UTF8 '%s' | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$it = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' } | Select-Object -First 1
if (-not $it) { Write-Output 'NOVOICE'; exit 0 }
$s.SelectVoice($it.VoiceInfo.Name)
$s.Rate = 1
foreach ($j in $jobs) { $s.SetOutputToWaveFile($j.file); $s.Speak($j.text) }
$s.SetOutputToNull(); $s.Dispose()
Write-Output "OK $($it.VoiceInfo.Name)"
""" % tmp.name.replace("'", "''")
    res = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True)
    os.unlink(tmp.name)
    if 'NOVOICE' in res.stdout or res.returncode != 0:
        print('Voci: nessuna voce italiana installata, salto.', res.stderr[:200])
        return {}
    print('Voci:', res.stdout.strip())
    manifest = {}
    for j in jobs:
        base = j['file'][:-4]
        if FFMPEG:
            # leggera normalizzazione del volume, poi mp3
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', j['file'], '-af', 'loudnorm=I=-16:TP=-1.5', '-ac', '1', '-b:a', '64k', base + '.mp3'], check=True)
            os.remove(j['file'])
        key = os.path.basename(base).rsplit('-', 1)[0]
        manifest.setdefault(key, []).append('voice/' + os.path.basename(base) + EXT)
    return manifest


# ------------------------------------------------------------------ melodie di pubblico dominio
# (id, titolo, compositore o None, categoria, bpm, strumento, melodia, basso o None, raddoppio all'ottava inferiore)
MELODIES = [
    ('inno', 'Inno alla gioia', 'Ludwig van Beethoven', 'classica', 120, 'strings',
     'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2', None, False),
    ('elisa', 'Per Elisa', 'Ludwig van Beethoven', 'classica', 130, 'piano',
     'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1 R:.5 C4:.5 E4:.5 A4:.5 B4:1 R:.5 E4:.5 G#4:.5 B4:.5 C5:1 R:.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:2', None, False),
    ('quinta', 'Quinta sinfonia', 'Ludwig van Beethoven', 'classica', 108, 'strings',
     'R:.5 G4:.5 G4:.5 G4:.5 Eb4:2 R:.5 F4:.5 F4:.5 F4:.5 D4:3', None, True),
    ('serenata', 'Piccola serenata notturna', 'Wolfgang Amadeus Mozart', 'classica', 130, 'strings',
     'G4:1 R:.5 D4:.5 G4:1 R:.5 D4:.5 G4:.5 D4:.5 G4:.5 B4:.5 D5:2 C5:1 R:.5 A4:.5 C5:1 R:.5 A4:.5 C5:.5 A4:.5 F#4:.5 A4:.5 D4:2', None, False),
    ('turca', 'Marcia turca', 'Wolfgang Amadeus Mozart', 'classica', 120, 'piano',
     'B4:.25 A4:.25 G#4:.25 A4:.25 C5:1 D5:.25 C5:.25 B4:.25 C5:.25 E5:1 F5:.25 E5:.25 D#5:.25 E5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 C6:2', None, False),
    ('toccata', 'Toccata e fuga in re minore', 'Johann Sebastian Bach', 'classica', 60, 'organ',
     'A4:.25 G4:.25 A4:1.5 R:.5 G4:.125 F4:.125 E4:.125 D4:.125 C#4:.5 D4:2', None, True),
    ('canone', 'Canone in re', 'Johann Pachelbel', 'classica', 70, 'strings',
     'F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2', 'D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2', False),
    ('nuziale', 'Marcia nuziale (Lohengrin)', 'Richard Wagner', 'classica', 70, 'organ',
     'C4:1 F4:.75 F4:.25 F4:2 C4:1 G4:.75 E4:.25 F4:2 C4:1 F4:.75 Bb4:.25 Bb4:1 A4:.75 G4:.25 F4:1 E4:.75 F4:.25 G4:2', None, False),
    ('montagna', "Nell'antro del re della montagna", 'Edvard Grieg', 'classica', 120, 'pluck',
     'A3:.5 B3:.5 C4:.5 D4:.5 E4:.5 C4:.5 E4:1 D#4:.5 B3:.5 D#4:1 D4:.5 Bb3:.5 D4:1 A3:.5 B3:.5 C4:.5 D4:.5 E4:.5 C4:.5 E4:.5 A4:.5 G4:.5 E4:.5 C4:.5 E4:.5 G4:2', None, False),
    ('mattino', 'Il mattino (Peer Gynt)', 'Edvard Grieg', 'classica', 100, 'flute',
     'G5:.5 E5:.5 D5:.5 C5:.5 D5:.5 E5:.5 G5:.5 E5:.5 D5:.5 C5:.5 D5:.25 E5:.25 D5:.25 E5:.25 G5:.5 E5:.5 G5:.5 A5:.5 E5:.5 A5:.5 G5:.5 E5:.5 D5:.5 C5:2', None, False),
    ('habanera', 'Habanera (Carmen)', 'Georges Bizet', 'classica', 70, 'strings',
     'D5:.75 C#5:.25 C5:.5 C5:.5 B4:.75 Bb4:.25 A4:.5 A4:.5 Ab4:.75 G4:.25 F4:.5 F4:.25 E4:.25 F4:.5 G4:.5 F4:.5 E4:1.5',
     'D3:.75 A3:.25 F3:.5 A3:.5 D3:.75 A3:.25 F3:.5 A3:.5 D3:.75 A3:.25 F3:.5 A3:.5 D3:.75 A3:.25 F3:.5 A3:.5', False),
    ('tell', 'Guglielmo Tell (ouverture)', 'Gioachino Rossini', 'classica', 150, 'brass',
     'G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 C5:.5 D5:.5 E5:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 C5:.5 E5:.25 E5:.25 D5:.5 B4:.5 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 C5:.5 D5:.5 E5:1.5', None, False),
    ('entertainer', 'The Entertainer', 'Scott Joplin', 'classica', 90, 'piano',
     'D4:.25 D#4:.25 E4:.25 C5:.5 E4:.25 C5:.5 E4:.25 C5:1.5 C5:.25 D5:.25 D#5:.25 E5:.25 C5:.25 D5:.25 E5:.5 B4:.25 D5:.5 C5:2', None, False),
    ('danubio', 'Sul bel Danubio blu', 'Johann Strauss figlio', 'classica', 160, 'strings',
     'D4:1 D4:1 F#4:1 A4:1 A4:2 R:1 A5:1 A5:2 R:1 F#5:1 F#5:2 R:1 D4:1 D4:1 F#4:1 A4:1 A4:2 R:1 A5:1 A5:2 R:1 G5:1 G5:2', None, False),
    ('cancan', "Can-can (Orfeo all'inferno)", 'Jacques Offenbach', 'classica', 140, 'piano',
     'C4:1 D4:.5 F4:.5 E4:.5 D4:.5 G4:1 G4:1 G4:.5 A4:.5 E4:.5 F4:.5 D4:1 D4:1 D4:.5 F4:.5 E4:.5 C4:.5 C4:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5', None, False),
    ('astro', 'Astro del ciel', 'Franz Xaver Gruber', 'popolare', 90, 'bell',
     'G4:1.5 A4:.5 G4:1 E4:3 G4:1.5 A4:.5 G4:1 E4:3 D5:2 D5:1 B4:3 C5:2 C5:1 G4:3', None, False),
    ('martino', 'Fra Martino', None, 'popolare', 120, 'piano',
     'C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 C4:1 G3:1 C4:2', None, False),
    ('auguri', 'Tanti auguri a te', None, 'popolare', 110, 'piano',
     'G4:.75 G4:.25 A4:1 G4:1 C5:1 B4:2 G4:.75 G4:.25 A4:1 G4:1 D5:1 C5:2 G4:.75 G4:.25 G5:1 E5:1 C5:1 B4:1 A4:2 F5:.75 F5:.25 E5:1 C5:1 D5:1 C5:2', None, False),
    ('jingle', 'Jingle Bells', None, 'popolare', 150, 'bell',
     'E4:1 E4:1 E4:2 E4:1 E4:1 E4:2 E4:1 G4:1 C4:1.5 D4:.5 E4:4 F4:1 F4:1 F4:1.5 F4:.5 F4:1 E4:1 E4:1 E4:.5 E4:.5 E4:1 D4:1 D4:1 E4:1 D4:2 G4:2', None, False),
    ('stellina', 'Brilla brilla la stellina', None, 'popolare', 110, 'piano',
     'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2', None, False),
    ('greensleeves', 'Greensleeves', None, 'popolare', 150, 'flute',
     'A4:1 C5:2 D5:1 E5:1.5 F5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:2 A4:1 A4:1.5 G#4:.5 A4:1 B4:2 G#4:1 E4:2 A4:1 C5:2 D5:1 E5:1.5 F5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:1.5 B4:.5 A4:1 G#4:1.5 F#4:.5 G#4:1 A4:3', None, False),
    ('saints', 'When the Saints Go Marching In', None, 'popolare', 140, 'brass',
     'C4:1 E4:1 F4:1 G4:4 C4:1 E4:1 F4:1 G4:4 C4:1 E4:1 F4:1 G4:2 E4:2 C4:2 E4:2 D4:4', None, False),
]


def build_melodies():
    out_dir = os.path.join(OUT, 'melodie')
    files = {}
    for mid, title, composer, cat, bpm, instr, seq, bass, double in MELODIES:
        y = render_seq(seq, bpm, instr, 1.0)
        tracks = [y]
        if double:
            tracks.append(render_seq(seq, bpm, instr, 0.6, octave=-1))
        if bass:
            tracks.append(render_seq(bass, bpm, 'bass', 0.6))
        x = mix(*tracks)
        x *= env(len(x), 0.005, 0.4)
        files[mid] = 'melodie/' + save(os.path.join(out_dir, mid), x, '64k')
    # pacchetto di domande
    titles = {cat: [m[1] for m in MELODIES if m[3] == cat] for cat in ('classica', 'popolare')}
    composers = sorted({m[2] for m in MELODIES if m[2]})
    questions = []
    for mid, title, composer, cat, *_ in MELODIES:
        audio = '/audio/' + files[mid]
        same = [t for t in titles[cat] if t != title]
        wrong = random.sample(same, 3)
        questions.append({'id': f'tit-{mid}', 'categoryId': cat, 'type': 'multiple', 'text': 'Che brano è?',
                          'options': [title] + wrong, 'correctIndex': 0, 'audio': audio, 'difficulty': 1 if cat == 'popolare' else 2})
        if composer:
            wrong_c = random.sample([c for c in composers if c != composer], 3)
            questions.append({'id': f'cmp-{mid}', 'categoryId': 'compositori', 'type': 'multiple', 'text': 'Chi ha composto questo brano?',
                              'options': [composer] + wrong_c, 'correctIndex': 0, 'audio': audio, 'difficulty': 3})
    pack = {
        'id': 'melodie', 'name': 'Melodie famose',
        'description': 'Brani di pubblico dominio per «Indovina il brano» (musica classica e canti popolari).',
        'builtIn': True, 'updatedAt': 0,
        'categories': [
            {'id': 'classica', 'name': 'Musica classica', 'icon': '🎻', 'color': '#9d4edd'},
            {'id': 'popolare', 'name': 'Canti popolari e feste', 'icon': '🎶', 'color': '#ff9f1c'},
            {'id': 'compositori', 'name': 'Chi l\'ha composto?', 'icon': '🎼', 'color': '#4361ee'},
        ],
        'questions': questions,
    }
    path = os.path.join(ROOT, 'server', 'data', 'packs', 'melodie.json')
    json.dump(pack, open(path, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=1)
    print(f'Melodie: {len(MELODIES)} brani, {len(questions)} domande')


# ------------------------------------------------------------------ main
def main():
    brand = json.load(open(os.path.join(ROOT, 'shared', 'brand.json'), encoding='utf8'))['name']
    os.makedirs(OUT, exist_ok=True)
    manifest = {
        '_istruzioni': 'Per sostituire un suono metti il tuo file (mp3, ogg o wav) in questa cartella e scrivi qui il suo nome. '
                       'Una lista con più file = il gioco ne sceglie uno a caso (utile per variare le battute). '
                       'Se un file manca il gioco usa un suono sintetizzato.',
        'volume': {'music': 0.35, 'sfx': 0.8, 'voice': 1.0},
        'music': {}, 'sfx': {}, 'voice': {},
    }
    for key, (bpm, prog, style) in MUSIC.items():
        manifest['music'][key] = 'music/' + save(os.path.join(OUT, 'music', key), music_track(bpm, prog, style))
        print('Musica:', key)
    for key, x in sfx_all().items():
        manifest['sfx'][key] = ['sfx/' + save(os.path.join(OUT, 'sfx', key), x, '64k')]
    print('Effetti:', len(manifest['sfx']))
    manifest['voice'] = build_voices(voice_lines(brand))
    build_melodies()
    json.dump(manifest, open(os.path.join(OUT, 'audio.json'), 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=2)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print(f'Fatto: {total / 1024 / 1024:.1f} MB in {OUT} (formato {EXT})')


if __name__ == '__main__':
    main()
