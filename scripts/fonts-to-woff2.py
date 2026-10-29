#!/usr/bin/env python3
"""
Konvertér font-biblioteket til .woff2 og opdatér alle @font-face-referencer.

Hvorfor: .woff2 er ~40-60% mindre end .ttf/.otf → mindre Vercel-deployment og hurtigere
font-load i overlays/editoren. Virker i alle moderne browsere + vMix' browser-kilde (CEF).

Kør fra repo-roden:
    pip install fonttools brotli
    python scripts/fonts-to-woff2.py

Hvad det gør:
  1) Konverterer hver fonts/*.ttf og fonts/*.otf til fonts/*.woff2 (springer eksisterende over).
  2) Opdaterer @font-face-referencerne i spx-fonts.css, fonts.css, fullscreen.html, lower-third.html
     (url ...ttf/.otf -> .woff2, format('truetype'/'opentype') -> format('woff2')).
  3) Rører IKKE fonts/google/ (allerede woff2), editoren (bruger font-navne), font-upload eller
     master's FMT-mapping (håndterer allerede woff2).

Originalerne (.ttf/.otf) slettes IKKE automatisk. Verificér editor + overlays, og fjern dem så
manuelt (git-historikken beholder dem som backup):
    git rm fonts/*.ttf fonts/*.otf
"""
import os
import re
import sys
import glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONTS_DIR = os.path.join(ROOT, 'fonts')
REF_FILES = ['spx-fonts.css', 'fonts.css', 'fullscreen.html', 'lower-third.html']

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit('Mangler fonttools. Kør:  pip install fonttools brotli')


def convert():
    srcs = sorted(glob.glob(os.path.join(FONTS_DIR, '*.ttf')) +
                  glob.glob(os.path.join(FONTS_DIR, '*.otf')))
    if not srcs:
        print('Ingen .ttf/.otf i fonts/ — måske allerede konverteret.')
        return 0, 0
    done = skip = fail = 0
    for src in srcs:
        dst = os.path.splitext(src)[0] + '.woff2'
        if os.path.exists(dst):
            skip += 1
            continue
        try:
            f = TTFont(src)
            f.flavor = 'woff2'
            f.save(dst)
            done += 1
            print('  woff2:', os.path.basename(dst))
        except Exception as e:  # noqa
            fail += 1
            print('  FEJL :', os.path.basename(src), '->', e)
    print(f'\nKonverteret {done}, sprunget over {skip}, fejl {fail}.')
    return done, fail


def update_refs():
    url_re = re.compile(r"(fonts/[^'\")]+)\.(ttf|otf)", re.IGNORECASE)
    changed = 0
    for rel in REF_FILES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        orig = s
        s = url_re.sub(r'\1.woff2', s)
        s = s.replace("format('truetype')", "format('woff2')")
        s = s.replace("format('opentype')", "format('woff2')")
        if s != orig:
            open(p, 'w', encoding='utf-8', newline='').write(s)
            print('  opdateret:', rel)
            changed += 1
    print(f'\nReference-filer opdateret: {changed}.')
    return changed


if __name__ == '__main__':
    print('== Konverterer fonte til .woff2 ==')
    done, fail = convert()
    print('\n== Opdaterer @font-face-referencer ==')
    update_refs()
    print('\nNæste skridt:')
    print('  1) Åbn grafik-editoren + et overlay og tjek at fontene stadig ser rigtige ud.')
    print('  2) Fjern originalerne (git-historikken er backup):  git rm fonts/*.ttf fonts/*.otf')
    print('  3) git add -A && commit && push')
    print('  4) Reload vMix-browser-kilderne (fullscreen/lower-third bruger de lokale fonte).')
    if fail:
        print('\nOBS: nogle fonte fejlede — tjek outputtet ovenfor før du sletter originaler.')
