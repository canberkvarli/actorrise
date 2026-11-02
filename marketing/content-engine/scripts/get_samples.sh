#!/usr/bin/env bash
# Fetch the instrument samples the music beds are built from (FluidR3 GM, MIT licensed,
# via gleitz/midi-js-soundfonts). Only the instruments we use, about 25 MB. Idempotent.
#   scripts/get_samples.sh   -> samples/FluidR3_GM/<instrument>-mp3/<note>.mp3
set -euo pipefail
cd "$(dirname "$0")/.."
INSTR="acoustic_grand_piano electric_piano_1 acoustic_bass pizzicato_strings string_ensemble_1 tremolo_strings
celesta glockenspiel music_box vibraphone timpani acoustic_guitar_nylon orchestral_harp"
DIRS=(); for i in $INSTR; do DIRS+=("/FluidR3_GM/$i-mp3/"); done
if [ ! -d samples/.git ]; then
  git clone -q --depth 1 --filter=blob:none --sparse https://github.com/gleitz/midi-js-soundfonts.git samples
fi
git -C samples sparse-checkout set --no-cone "${DIRS[@]}"
echo "samples ready: $(ls samples/FluidR3_GM | wc -l) instruments"
