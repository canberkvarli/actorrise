#!/usr/bin/env bash
# Fetch the instrument samples the music beds are built from (FluidR3 GM, MIT licensed,
# via gleitz/midi-js-soundfonts). Only the instruments we use, about 25 MB. Idempotent.
#   scripts/get_samples.sh   -> samples/FluidR3_GM/<instrument>-mp3/<note>.mp3
set -euo pipefail
cd "$(dirname "$0")/.."
INSTR="acoustic_grand_piano electric_piano_1 acoustic_bass pizzicato_strings string_ensemble_1 tremolo_strings
celesta glockenspiel music_box vibraphone timpani acoustic_guitar_nylon orchestral_harp
marimba kalimba woodblock xylophone"
DIRS=(); for i in $INSTR; do DIRS+=("/FluidR3_GM/$i-mp3/"); done
# samples/ also holds the committed voice samples, so a fresh clone of this repo already has the
# folder and git refuses to clone into it: the soundfont repo lives in samples/_fluid, linked in.
if [ -d samples/.git ]; then SF=samples; else
  SF=samples/_fluid
  [ -d "$SF/.git" ] || git clone -q --depth 1 --filter=blob:none --sparse https://github.com/gleitz/midi-js-soundfonts.git "$SF"
  [ -e samples/FluidR3_GM ] || ln -s _fluid/FluidR3_GM samples/FluidR3_GM
fi
git -C "$SF" sparse-checkout set --no-cone "${DIRS[@]}"
echo "samples ready: $(ls samples/FluidR3_GM | wc -l) instruments"
