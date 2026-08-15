#!/usr/bin/env python3
"""Generate the CURHAT DONG design-system preview bundle for claude.ai/design.

Each preview is a standalone HTML document whose **first line** carries the
`@dsCard` marker the Design System pane indexes on. Token values are copied from
`apps/web/lib/tokens.ts`; the markup mirrors the real components in
`apps/web/components/`.

Usage:
    python3 docs/design-sync/gen-bundle.py [OUTDIR]

Default OUTDIR is `.design-bundle/` at the repo root (gitignored — the bundle is
a build artifact, the generator is the source).

The Nunito face is embedded as a data URI so a card renders the real typeface in
isolation. It is read from the Next.js build output, so run `pnpm --filter
@curhat/web build` (or `dev`) at least once first. Without it the bundle still
builds and falls back to the rounded system stack.
"""
from __future__ import annotations

import base64
import html
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / ".design-bundle"

# --------------------------------------------------------------------- font
def find_nunito() -> str | None:
    """Locate the latin subset of Nunito in the Next.js build output.

    next/font hashes the filenames, so the file is resolved through the
    generated @font-face CSS rather than hardcoded: the `U+??`/`U+0-00FF`
    unicode-range block is the latin subset.
    """
    media = REPO / "apps/web/.next/static/media"
    if not media.is_dir():
        return None
    for css in (REPO / "apps/web/.next").rglob("*nunito*.css"):
        text = css.read_text(encoding="utf-8", errors="ignore")
        for block in text.split("@font-face")[1:]:
            if "U+??" not in block and "U+0-00FF" not in block:
                continue
            m = re.search(r"([A-Za-z0-9_.-]+\.woff2)", block)
            if m and (media / m.group(1)).exists():
                return base64.b64encode((media / m.group(1)).read_bytes()).decode()
    # Fall back to the largest woff2 present.
    files = sorted(media.glob("*.woff2"), key=lambda p: p.stat().st_size, reverse=True)
    if files:
        return base64.b64encode(files[0].read_bytes()).decode()
    return None


FONT_B64 = find_nunito()
FONT_FACE = (
    "@font-face{font-family:Nunito;font-style:normal;font-weight:200 1000;"
    f"font-display:swap;src:url(data:font/woff2;base64,{FONT_B64}) format(\"woff2\");}}"
    if FONT_B64
    else "/* Nunito not embedded — run a web build first. */"
)

# ------------------------------------------------------------------- tokens
# Mirrored from apps/web/lib/tokens.ts. Kept honest by lib/css-tokens.test.ts
# and lib/contrast.test.ts on the app side; if you change a hex there, change it
# here and regenerate.
LIGHT = dict(bg="#fff5f8", surface="#ffffff", surface_alt="#ffe6ee", border="#f4cfdd",
             text="#2b1233", muted="#6b4257", primary="#c2185b", primary_fg="#ffffff",
             brand="#fa4b7d", lav="#6d4ae0", amber="#ffb020", accent_fg="#2b1233",
             tint_pink="#ffdce7", tint_lav="#e9e1ff", tint_amber="#ffebcb", tint_rose="#ffd3e1",
             danger="#7e2f0c", danger_fg="#ffffff",
             shadow="0 1px 1px rgba(43,18,51,.04), 0 10px 26px -20px rgba(194,24,91,.55)")
DARK = dict(bg="#1a1020", surface="#251729", surface_alt="#33203a", border="#4a2c46",
            text="#f7e9f0", muted="#c9a9bb", primary="#ff86bb", primary_fg="#1a1020",
            brand="#ff9fca", lav="#c4b0ff", amber="#ffc978", accent_fg="#1a1020",
            tint_pink="#3d2138", tint_lav="#2f2650", tint_amber="#3d3020", tint_rose="#452133",
            danger="#ff9d80", danger_fg="#1a1020",
            shadow="0 1px 1px rgba(0,0,0,.3), 0 10px 26px -20px rgba(0,0,0,.9)")
MID = dict(bg="#120a16", surface="#1a1020", surface_alt="#251729", border="#3a2340",
           text="#efdde7", muted="#b898aa", primary="#f582b4", primary_fg="#120a16",
           brand="#f596c2", lav="#b7a2f5", amber="#f0bd72", accent_fg="#120a16",
           tint_pink="#301a2c", tint_lav="#251d40", tint_amber="#302618", tint_rose="#361a28",
           danger="#f0977c", danger_fg="#120a16",
           shadow="0 1px 1px rgba(0,0,0,.4), 0 10px 26px -20px rgba(0,0,0,1)")

TOKEN_ROWS = [("bg", "bg"), ("surface", "surface"), ("surfaceAlt", "surface_alt"),
              ("border", "border"), ("text", "text"), ("muted", "muted"),
              ("primary", "primary"), ("primaryFg", "primary_fg"), ("brand", "brand"),
              ("accentLavender", "lav"), ("accentAmber", "amber"), ("accentFg", "accent_fg"),
              ("tintPink", "tint_pink"), ("tintLavender", "tint_lav"),
              ("tintAmber", "tint_amber"), ("tintRose", "tint_rose"),
              ("danger", "danger"), ("dangerFg", "danger_fg")]


def vars_block(t: dict) -> str:
    return f"""--color-bg:{t['bg']};--color-surface:{t['surface']};--color-surface-alt:{t['surface_alt']};
  --color-border:{t['border']};--color-text:{t['text']};--color-muted:{t['muted']};
  --color-primary:{t['primary']};--color-primary-fg:{t['primary_fg']};--color-brand:{t['brand']};
  --color-accent-lavender:{t['lav']};--color-accent-amber:{t['amber']};--color-accent-fg:{t['accent_fg']};
  --color-tint-pink:{t['tint_pink']};--color-tint-lavender:{t['tint_lav']};
  --color-tint-amber:{t['tint_amber']};--color-tint-rose:{t['tint_rose']};
  --color-danger:{t['danger']};--color-danger-fg:{t['danger_fg']};--shadow-card:{t['shadow']};"""


CSS = f"""{FONT_FACE}
*{{box-sizing:border-box;}}
:root{{--radius-curhat:20px;--radius-action:999px;--radius-chip:999px;--size-touch:44px;
  --sans:Nunito,ui-rounded,"Segoe UI Rounded",system-ui,-apple-system,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}}
html,body{{margin:0;padding:0;}}
body{{font-family:var(--sans);background:#f2eef1;padding:20px;}}
@media (prefers-color-scheme:dark){{body{{background:#15101a;}}}}
.t{{{vars_block(LIGHT)}}}
.t-dark{{{vars_block(DARK)}}}
.t-mid{{{vars_block(MID)}}}
.stage{{background:var(--color-bg);color:var(--color-text);border-radius:16px;padding:22px;
  border:1px solid var(--color-border);}}
.pair{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;}}
.lbl{{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--color-muted);margin:0 0 14px;}}
.note{{font-size:12.5px;line-height:1.55;color:var(--color-muted);margin:14px 0 0;}}
.note b{{color:var(--color-text);}}
.row{{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}}
.col{{display:flex;flex-direction:column;gap:12px;}}
code{{font-family:var(--mono);font-size:11.5px;background:var(--color-surface-alt);
  padding:1px 5px;border-radius:5px;}}

/* --- real component classes, mirrored from apps/web/components --- */
.btn{{display:inline-flex;min-height:var(--size-touch);align-items:center;justify-content:center;
  gap:8px;border-radius:var(--radius-chip);padding:0 24px;font:700 15px var(--sans);
  border:0;cursor:pointer;}}
.btn-primary{{background:var(--color-primary);color:var(--color-primary-fg);}}
.btn-secondary{{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);}}
.btn-ghost{{background:none;color:var(--color-text);text-decoration:underline;text-underline-offset:4px;}}
.card{{border-radius:var(--radius-curhat);background:var(--color-surface);}}
.card-lift{{border:1px solid transparent;box-shadow:var(--shadow-card);}}
.field{{width:100%;min-height:var(--size-touch);border-radius:var(--radius-curhat);
  border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);
  padding:10px 16px;font:400 14px var(--sans);}}
.badge{{display:inline-flex;align-items:center;gap:6px;border-radius:var(--radius-chip);
  padding:2px 12px;font:700 12px var(--sans);}}
.badge-brand{{background:var(--color-brand);color:var(--color-accent-fg);}}
.badge-amber{{background:var(--color-accent-amber);color:var(--color-accent-fg);}}
.badge-lav{{background:var(--color-tint-lavender);color:var(--color-text);}}
.badge-muted{{border:1px solid var(--color-border);color:var(--color-muted);}}
.wordmark{{display:inline-flex;align-items:baseline;gap:4px;font:900 20px var(--sans);
  text-transform:lowercase;color:var(--color-text);}}
.wordmark .pill{{border-radius:var(--radius-chip);background:var(--color-brand);
  color:var(--color-accent-fg);padding:2px 8px;font-size:16px;}}
.wordmark .mono-d{{font:600 16px var(--sans);color:var(--color-muted);}}
.curhat{{border-radius:var(--radius-curhat);background:var(--color-surface);padding:18px;
  box-shadow:var(--shadow-card);}}
.curhat h3{{margin:8px 0 0;font:700 17px var(--sans);color:var(--color-text);}}
.curhat .exc{{margin:6px 0 0;font:400 14px/1.6 var(--sans);color:var(--color-text);opacity:.85;}}
.curhat .by{{margin:12px 0 0;font-size:12px;color:var(--color-muted);display:flex;gap:6px;flex-wrap:wrap;}}
.curhat .ft{{margin-top:16px;padding-top:12px;border-top:1px solid var(--color-border);
  display:flex;justify-content:space-between;align-items:center;gap:12px;}}
.curhat .ft span{{font-size:12px;color:var(--color-muted);}}
.v-butuh{{border-left:4px solid var(--color-accent-amber);border-top-left-radius:6px;border-bottom-left-radius:6px;}}
.v-held{{border:1px dashed var(--color-muted);box-shadow:none;}}
.notice{{margin:12px 0 0;border-radius:12px;padding:8px 12px;font-size:13.5px;}}
.notice-amber{{background:var(--color-tint-amber);color:var(--color-text);}}
.notice-alt{{background:var(--color-surface-alt);color:var(--color-muted);}}
.read{{min-height:var(--size-touch);border-radius:var(--radius-action);
  border:1.5px solid var(--color-brand);background:none;color:var(--color-text);
  padding:0 20px;font:700 14px var(--sans);cursor:pointer;}}
.rx{{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;}}
.rx button{{display:inline-flex;min-height:var(--size-touch);align-items:center;gap:6px;
  border-radius:999px;border:1px solid var(--color-border);background:var(--color-surface);
  color:var(--color-text);padding:0 14px;font:400 14px var(--sans);cursor:pointer;}}
.rx button.given{{border-color:var(--color-primary);background:var(--color-tint-pink);font-weight:700;}}
.chip{{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;font:600 13px var(--sans);
  background:var(--color-tint-pink);color:var(--color-text);}}
.chip-out{{background:none;border:1px solid var(--color-border);color:var(--color-text);}}
.s-round{{border-radius:999px;}} .s-square{{border-radius:6px;}}
.s-notch{{border-radius:999px;border-top-left-radius:0;}} .s-pill{{border-radius:999px;padding:4px 16px;}}
.bub{{max-width:80%;border-radius:var(--radius-curhat);padding:10px 16px;font:400 14px/1.6 var(--sans);}}
.bub-self{{border-bottom-right-radius:6px;background:var(--color-primary);color:var(--color-primary-fg);margin-left:auto;}}
.bub-ai{{border-bottom-left-radius:6px;background:var(--color-tint-lavender);color:var(--color-text);}}
.bub-human{{border-bottom-left-radius:6px;border:1px solid var(--color-border);
  background:var(--color-surface);color:var(--color-text);}}
.empty{{border:1px dashed var(--color-border);background:var(--color-surface-alt);
  border-radius:var(--radius-curhat);padding:28px;text-align:center;}}
.empty h4{{margin:0;font:600 16px var(--sans);color:var(--color-text);}}
.empty p{{margin:8px auto 0;max-width:38ch;font-size:13.5px;color:var(--color-muted);}}
"""

CARDS: list[dict] = []


def doc(group: str, title: str, body: str, subtitle: str = "") -> str:
    sub = f'<p class="lbl">{subtitle}</p>' if subtitle else ""
    return f"""<!-- @dsCard group="{group}" -->
<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<style>{CSS}</style></head>
<body class="t">{sub}{body}</body></html>
"""


def pair(light: str, dark: str | None = None) -> str:
    """Same component on a light ground and a dark ground, side by side."""
    d = dark if dark is not None else light
    return ('<div class="pair">'
            f'<div class="t stage"><p class="lbl">light &mdash; pagi merah muda</p>{light}</div>'
            f'<div class="t-dark stage"><p class="lbl">dark &mdash; malam plum</p>{d}</div>'
            '</div>')


def card(path: str, group: str, name: str, subtitle: str, title: str,
         body: str, w: int = 900) -> None:
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(doc(group, title, body, subtitle), encoding="utf-8")
    CARDS.append({"name": name, "path": path, "group": group,
                  "subtitle": subtitle, "viewport": {"width": w}})


# ------------------------------------------------------------- foundations
def swatch_panel(t: dict, label: str, cls: str) -> str:
    rows = "".join(
        f'<div style="display:flex;align-items:center;gap:10px;padding:4px 0">'
        f'<span style="width:24px;height:24px;border-radius:6px;background:{t[k]};'
        f'box-shadow:inset 0 0 0 1px rgba(128,128,128,.3);flex:none"></span>'
        f'<span style="flex:1;font:600 12.5px var(--sans)">{n}</span>'
        f'<span style="font-family:var(--mono);font-size:11px;opacity:.7">{t[k]}</span></div>'
        for n, k in TOKEN_ROWS)
    return f'<div class="{cls} stage"><p class="lbl">{label}</p>{rows}</div>'


card("foundations/colors.html", "Foundations", "Warna", "19 token x 3 tema", "Warna",
     '<div class="pair">'
     + swatch_panel(LIGHT, "light &mdash; pagi merah muda", "t")
     + swatch_panel(DARK, "dark &mdash; malam plum", "t-dark")
     + swatch_panel(MID, "midnight &mdash; 21.00&ndash;04.00", "t-mid")
     + '</div><div class="t"><p class="note"><b>Rose dalam mikul aksi, pink terang mikul '
       'identitas.</b> Putih di atas <code>brand</code> #FA4B7D cuma 3.30:1 &mdash; gagal AA, '
       'jadi pink logo tidak akan pernah bisa jadi isian tombol berteks putih. '
       '<code>primary</code> #C2185B (5.87:1) yang mikul aksi. Sumber: '
       '<code>apps/web/lib/tokens.ts</code>.</p></div>', w=1100)

_type = """<div class="col">
<div style="font:900 54px/1.05 var(--sans);letter-spacing:-.03em">Ada tempat buat cerita.</div>
<div style="font:900 30px var(--sans);letter-spacing:-.025em">Cerita Terbaru</div>
<div style="font:900 27px var(--sans)">Hai, Bulan</div>
<div style="font:900 20px var(--sans)">Fitur Utama</div>
<div style="font:700 17px var(--sans)">Judul kartu curhat</div>
<div style="font:400 14px/1.6 var(--sans)">Body 14px &mdash; kadang kita nggak butuh solusi. Kita cuma butuh didengar.</div>
<div style="font:400 12px var(--sans);color:var(--color-muted)">Metadata 12px &middot; Kesepian &middot; 2 jam lalu</div>
</div>"""
card("foundations/typography.html", "Foundations", "Tipografi", "Nunito 400-900", "Tipografi",
     pair(_type)
     + '<div class="t"><p class="note"><b>Nunito</b> lewat <code>next/font</code> &mdash; diunduh '
       'saat build, self-host, nol request pihak ketiga. Sans membulat dipilih supaya produk ini '
       'tidak terasa seperti perangkat lunak. Heading pakai <code>letter-spacing:-.022em</code> '
       'dan <code>text-wrap:balance</code>.</p></div>', w=1000)

_shape = """<div class="col"><div class="row">
<span style="width:80px;height:60px;border-radius:20px;background:var(--color-tint-pink);
 display:inline-flex;align-items:center;justify-content:center;font:700 11px var(--mono)">20px</span>
<span style="height:44px;border-radius:999px;background:var(--color-primary);color:var(--color-primary-fg);
 display:inline-flex;align-items:center;padding:0 24px;font:700 13px var(--sans)">pill 999px</span>
<span style="width:44px;height:44px;border:2px dashed var(--color-brand);border-radius:8px;
 display:inline-flex;align-items:center;justify-content:center;font:700 10px var(--mono)">44</span>
</div></div>"""
card("foundations/shape-spacing.html", "Foundations", "Bentuk & spacing",
     "Radius, target sentuh", "Bentuk & spacing", pair(_shape)
     + '<div class="t"><p class="note"><code>--radius-curhat</code> 20px untuk kartu, sheet, modal '
       'dan input; <code>--radius-action</code> pill penuh untuk tombol aksi dan FAB. '
       '<b>Target sentuh minimum 44px</b>, berlaku juga untuk tombol reaksi &mdash; enam ketukan '
       'kecil berderet persis tempat target minimum berhenti jadi teori.</p></div>')

# ----------------------------------------------------------------- actions
_btn = """<div class="col">
<div class="row">
<button class="btn btn-primary">Mulai Curhat</button>
<button class="btn btn-secondary">Nanti aja</button>
<button class="btn btn-ghost">Lewati</button></div>
<div class="row">
<button class="btn btn-primary" disabled style="opacity:.6">Kirim</button>
<span style="min-height:56px;min-width:56px;aspect-ratio:1;border-radius:999px;
 border:4px solid var(--color-bg);background:var(--color-primary);color:var(--color-primary-fg);
 display:inline-flex;align-items:center;justify-content:center;font:700 24px var(--sans);
 box-shadow:var(--shadow-card)">+</span>
<span class="wordmark">curhat<span class="pill">dong</span></span>
<span class="wordmark">curhat<span class="mono-d">dong</span></span>
</div></div>"""
card("components/buttons.html", "Actions", "Tombol & wordmark",
     "primary / secondary / ghost, FAB, 2 tone wordmark", "Tombol", pair(_btn)
     + '<div class="t"><p class="note">FAB pakai <code>min-h-14 min-w-14 aspect-square</code>, '
       'bukan kotak 56px tetap: lingkaran berukuran tetap memotong glyph-nya sendiri saat teks '
       'diskalakan 200% (E15-T17). Wordmark <code>brand</code> untuk landing dan auth; '
       '<code>mono</code> di rail produk, supaya pill pink tidak jadi satu-satunya benda '
       'tersaturasi di kolom navigasi.</p></div>')

_badge = """<div class="col"><div class="row">
<span class="badge badge-brand">Listener</span>
<span class="badge badge-amber">Butuh didengar</span>
<span class="badge badge-lav">DONG AI</span>
<span class="badge badge-muted">Kesepian</span></div>
<input class="field" placeholder="Tulis alias kamu">
<textarea class="field" rows="2" placeholder="Ceritain aja, nggak harus rapi."></textarea>
</div>"""
card("components/badges-fields.html", "Actions", "Badge & input",
     "4 tone, field 20px radius", "Badge & input", pair(_badge)
     + '<div class="t"><p class="note"><code>brand</code> dan <code>amber</code> adalah isian, '
       'jadi keduanya wajib membawa <code>accent-fg</code> (plum gelap) &mdash; tidak pernah putih. '
       'Field mempertahankan radius <b>kartu</b>, bukan pill: input multi-baris berbentuk pill '
       'tidak punya tempat menaruh teksnya.</p></div>')


# -------------------------------------------------------------------- feed
def curhat(variant: str = "default") -> str:
    cls = {"default": "", "butuh-didengar": " v-butuh", "held": " v-held", "anonymous": ""}[variant]
    notice = ""
    if variant == "butuh-didengar":
        notice = ('<p class="notice notice-amber">Belum banyak yang balas. '
                  'Kalau kamu punya waktu sebentar.</p>')
    if variant == "held":
        notice = ('<p class="notice notice-alt">Curhatmu kami tinjau dulu sebentar ya. '
                  'Baru kamu yang bisa lihat ini.</p>')
    who = "Anonim #7K2M" if variant == "anonymous" else "Bulan"
    replies = "4 balasan" if variant == "default" else "Belum ada balasan"
    return f"""<article class="curhat{cls}">
<div class="row"><span class="chip s-round">&#128532; Sedih</span>
<span class="chip chip-out s-pill">&#128066; Aku cuma mau didengar</span></div>
<div class="by"><span>{who}</span><span>&middot;</span><span>Kesepian</span><span>&middot;</span><span>2 jam lalu</span></div>
<h3>Rasanya rame tapi nggak ada yang nanya kabar</h3>
<p class="exc">Tiap hari ketemu banyak orang, ngobrol, ketawa. Tapi pas sampai kamar, sepi banget.</p>
{notice}
<div class="ft"><span>{replies}</span><button class="read">Baca</button></div></article>"""


card("components/curhat-card.html", "Feed", "CurhatCard",
     "4 varian: default, butuh-didengar, anonim, held", "CurhatCard",
     '<div class="pair">'
     f'<div class="t stage"><p class="lbl">default</p>{curhat()}</div>'
     f'<div class="t-dark stage"><p class="lbl">butuh didengar</p>{curhat("butuh-didengar")}</div>'
     f'<div class="t stage"><p class="lbl">anonim &mdash; kode acak per post</p>{curhat("anonymous")}</div>'
     f'<div class="t-dark stage"><p class="lbl">held &mdash; cuma penulis yang lihat</p>{curhat("held")}</div>'
     '</div><div class="t"><p class="note">Mood dan intent memimpin, byline menyusul: yang dipakai '
     'pembaca untuk memutuskan adalah bagaimana perasaan orang ini dan apa yang dia minta. '
     '<b>Tidak ada jumlah follower, view, atau ranking di kartu ini</b> (PRD &sect;11). Varian '
     '<code>butuh-didengar</code> ditandai tepi amber <b>plus kalimat</b> &mdash; aksen tidak '
     'pernah jadi satu-satunya pembeda.</p></div>', w=1000)

_rx = """<ul class="rx">
<li><button>&#129309; Aku ngerti</button></li>
<li><button class="given">&#129330; Peluk virtual</button></li>
<li><button>&#128066; Aku dengerin</button></li>
<li><button>&#129706; Aku pernah di situ</button></li>
<li><button>&#127793; Tetap kuat</button></li>
<li><button>&#128172; Cerita lagi</button></li></ul>"""
card("components/reaction-bar.html", "Feed", "ReactionBar",
     "6 reaksi kata, hitungan default tersembunyi", "ReactionBar", pair(_rx)
     + '<div class="t"><p class="note"><b>Kata selalu tampil, glyph cuma di sebelahnya.</b> Enam '
       'glyph telanjang akan runtuh jadi rating: mata memilih favorit, hati jadi default, dan '
       '&ldquo;aku pernah di situ&rdquo; berubah jadi persetujuan. Reaksi yang sudah diberi '
       'ditandai <b>bobot border + bobot font + <code>aria-pressed</code></b>, bukan warna saja. '
       'Hitungan default <b>tersembunyi</b> &mdash; angka yang sama terbaca &ldquo;kamu nggak '
       'dibutuhkan&rdquo; di feed, tapi &ldquo;dua belas orang mendengarmu&rdquo; di halaman '
       'penulisnya.</p></div>')

_moods = "".join(f'<span class="chip s-{s}">{g} {n}</span>' for g, n, s in [
    ("&#128532;", "Sedih", "round"), ("&#128548;", "Marah", "notch"),
    ("&#128560;", "Cemas", "notch"), ("&#128558;&#8205;&#128168;", "Capek", "round"),
    ("&#128148;", "Patah hati", "round"), ("&#129765;", "Kosong", "square"),
    ("&#127744;", "Overthinking", "notch"), ("&#127781;&#65039;", "Lega", "pill"),
    ("&#128578;", "Senang", "pill"), ("&#129293;", "Bersyukur", "pill"),
    ("&#128533;", "Bingung", "square")])
_intents = "".join(f'<span class="chip chip-out s-{s}">{g} {n}</span>' for g, n, s in [
    ("&#128066;", "Aku cuma mau didengar", "pill"), ("&#128161;", "Aku butuh saran", "square"),
    ("&#129330;", "Aku butuh dukungan", "round"),
    ("&#128587;", "Ada yang pernah ngalamin?", "notch")])
card("components/chips.html", "Feed", "Mood & Intent", "11 mood terisi, 4 intent outline",
     "Mood & Intent",
     pair(f'<div class="col"><div class="row">{_moods}</div><div class="row">{_intents}</div></div>')
     + '<div class="t"><p class="note"><b>Tiap nilai punya bentuk, bukan cuma warna</b> &mdash; '
       'dua mood yang hanya berbeda hue adalah dua mood yang tidak bisa dibedakan pembaca buta '
       'warna. Bentuk diberikan menurut keluarga emosi: berat &rarr; bulat, gelisah &rarr; '
       'bertakik, datar &rarr; kotak, ringan &rarr; pill. Mood <b>terisi</b>, intent '
       '<b>outline</b>, supaya pasangannya terbaca sebagai dua jenis fakta berbeda.</p></div>',
     w=1000)

# ------------------------------------------------------------ conversation
_bub = """<div class="col">
<div class="bub bub-self">Aku lagi nggak tahu harus mulai dari mana.</div>
<div class="bub bub-human">Nggak apa-apa. Mulai dari mana aja yang kamu mau.</div>
<div class="bub bub-ai">Aku dengerin. Kalau kamu mau, ceritain aja pelan-pelan.</div></div>"""
card("components/chat-bubble.html", "Conversation", "ChatBubble",
     "self / human / ai — prop tone", "ChatBubble", pair(_bub)
     + '<div class="t"><div style="border:2px solid var(--color-danger);border-radius:16px;'
       'padding:18px;margin-top:16px;background:var(--color-surface)">'
       '<p style="margin:0;font:800 15px var(--sans);color:var(--color-danger)">'
       'Satu kebohongan visual yang dilarang</p>'
       '<p class="note" style="margin-top:8px"><b>Balon lawan bicara di room listener tidak boleh '
       'lavender.</b> Lavender berarti &ldquo;ini bukan manusia&rdquo; di seluruh produk; merender '
       'pesan seorang manusia dalam warna itu adalah satu-satunya kebohongan visual yang sistem '
       'ini tidak boleh lakukan. Karena itu <code>tone</code> default-nya <code>human</code>, dan '
       'ada test yang gagal kalau balon <code>from="other"</code> tanpa <code>tone</code> memuat '
       '<code>tint-lavender</code>.</p>'
       '<p class="note">Sudut ekor dikotakkan per sisi &mdash; kedua sisi berbeda <b>bentuk</b>, '
       'bukan cuma warna.</p></div></div>')

_comment = """<div class="col">
<div class="card card-lift" style="padding:16px">
<div style="font-size:12px;color:var(--color-muted)">Senja &middot; 1 jam lalu</div>
<p style="margin:6px 0 0;font:400 14px/1.6 var(--sans)">Aku pernah di fase itu. Nggak ada saran, cuma mau bilang kamu nggak sendirian.</p>
<div style="margin-top:10px"><span class="badge badge-amber">&#129293; Jawaban ini membantu gue</span></div></div>
<div class="card card-lift" style="padding:16px;margin-left:16px;border-left:3px solid var(--color-brand);border-top-left-radius:6px;border-bottom-left-radius:6px">
<div style="font-size:12px;color:var(--color-muted)">Bulan &middot; 40 menit lalu</div>
<p style="margin:6px 0 0;font:400 14px/1.6 var(--sans)">Makasih ya. Baca ini aja udah bikin lega.</p></div></div>"""
card("components/comment-item.html", "Conversation", "CommentItem",
     "depth 0 dan 1, badge membantu", "CommentItem", pair(_comment)
     + '<div class="t"><p class="note">Nesting <b>dipaksa satu level</b>: percakapan bercabang '
       'dalam mengubah utas dukungan jadi forum debat. Badge &ldquo;membantu&rdquo; ditulis '
       'sebagai kalimat orang pertama, bukan skor.</p></div>')

_listener = """<div class="card card-lift" style="padding:18px">
<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
<div><div style="font:700 16px var(--sans)">Senja</div>
<div style="font-size:12.5px;color:var(--color-muted);margin-top:2px">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-primary);margin-right:6px"></span>Lagi bisa dengerin</div></div>
<span class="badge badge-brand">Listener</span></div>
<p style="margin:12px 0 0;font:400 13.5px/1.6 var(--sans);opacity:.85">Aku nggak jago ngasih saran, tapi aku bisa nemenin sampai kamu selesai cerita.</p>
<div class="row" style="margin-top:12px"><span class="badge badge-muted">Kesepian</span><span class="badge badge-muted">Kerjaan</span></div>
<p style="margin:12px 0 0;font-size:12.5px;color:var(--color-muted)">82% orang yang ngobrol sama dia merasa didengar.</p>
<button class="btn btn-primary" style="margin-top:14px;width:100%">Minta Senja jadi pendengar</button></div>"""
card("components/listener-card.html", "Conversation", "ListenerCard",
     "ketersediaan sebagai titik + kata", "ListenerCard", pair(_listener)
     + '<div class="t"><p class="note">Ketersediaan ditandai titik <b>plus kata</b>. Felt-heard '
       'ditulis sebagai <b>kalimat</b>, tidak pernah skor telanjang &mdash; angka di sebelah nama '
       'orang mengubah pendengar jadi peringkat.</p></div>')

_empty = """<div class="empty"><h4>Belum ada yang cerita di sini.</h4>
<p>Mau jadi yang pertama? Nggak harus panjang, nggak harus rapi.</p>
<button class="btn btn-primary" style="margin-top:16px">Mulai curhat</button></div>"""
_empty2 = """<div class="empty"><h4>Belum ada yang balas.</h4>
<p>Kadang butuh waktu. Cerita kamu tetap kebaca kok.</p></div>"""
card("components/empty-state.html", "Conversation", "EmptyState",
     "8 konteks, copy hangat", "EmptyState", pair(_empty, _empty2)
     + '<div class="t"><p class="note">Hangat dan kontekstual, tidak pernah &ldquo;No data&rdquo; '
       '&mdash; layar kosong adalah momen orang paling mungkin menutup aplikasi. Sebagian konteks '
       '<b>sengaja tanpa tombol</b>: menunggu balasan bukan masalah yang bisa diselesaikan '
       'pembaca.</p></div>')

# --------------------------------------------------------------- navigation
_bar = ('<div style="display:flex;gap:6px;background:var(--color-surface);border:1px solid '
        'var(--color-border);border-radius:999px;padding:8px;box-shadow:var(--shadow-card);'
        'position:relative">')
for _g, _n, _st in [("&#8962;", "Beranda", 1), ("&#9993;", "DONG AI", 0),
                    ("&#9781;", "Komunitas", -1), ("&#9788;", "Notifikasi", 0),
                    ("&#9737;", "Akun", 0)]:
    _bg = "background:var(--color-tint-pink);color:var(--color-primary);font-weight:700;" if _st == 1 else ""
    _op = "opacity:.45;" if _st == -1 else ""
    _bar += (f'<span style="flex:1;text-align:center;padding:6px 4px;border-radius:999px;{_bg}{_op}'
             f'font:400 11px var(--sans)"><span style="display:block;font-size:17px">{_g}</span>{_n}</span>')
_bar += ('<span style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);'
         'min-height:56px;min-width:56px;aspect-ratio:1;border-radius:999px;border:4px solid '
         'var(--color-bg);background:var(--color-primary);color:var(--color-primary-fg);'
         'display:inline-flex;align-items:center;justify-content:center;font:700 24px var(--sans)">+</span></div>')

_rail = '<div style="display:flex;flex-direction:column;gap:2px">'
for _g, _n in [("&#8962;", "Beranda"), ("&#9993;", "DONG AI"), ("&#9781;", "Komunitas"),
               ("&#9788;", "Notifikasi"), ("&#9825;", "Cari Listener"), ("&#9737;", "Jelajah"),
               ("&#9906;", "Cari"), ("&#9711;", "Akun")]:
    _bg = "background:var(--color-tint-pink);color:var(--color-primary);font-weight:700;" if _n == "Beranda" else ""
    _op = "opacity:.45;" if _n == "Komunitas" else ""
    _rail += (f'<span style="display:flex;align-items:center;gap:12px;padding:10px 20px;'
              f'border-radius:999px;{_bg}{_op}font:400 15px var(--sans)">'
              f'<span style="font-size:19px">{_g}</span>{_n}</span>')
_rail += ('<button class="btn btn-primary" style="margin-top:12px;width:100%">+ Curhat</button></div>')

card("components/navigation.html", "Navigation", "Navigasi",
     "bar HP 5 slot + rail desktop 8 tujuan", "Navigasi",
     '<div class="pair">'
     f'<div class="t stage" style="padding-top:34px"><p class="lbl">bar HP &mdash; 5 slot + FAB</p>{_bar}</div>'
     f'<div class="t-dark stage"><p class="lbl">rail desktop &mdash; 8 tujuan</p>{_rail}</div>'
     '</div><div class="t"><p class="note"><b>Satu komponen, dua bentuk</b> &mdash; bukan dua '
     'komponen. Dua nav berarti dua landmark dan dua urutan tab untuk lima tujuan yang sama. '
     '<b>Komunitas</b> dirender nonaktif dengan label jujur dan <code>href</code> kosong, supaya '
     'tidak pernah bisa jadi tautan mati.</p>'
     '<p class="note"><b>Catatan produk:</b> tab mobile berbeda (Home &middot; Explore &middot; '
     'Listen &middot; Profil) dan hanya berbagi dua konsep dengan web. Keputusan yang belum pernah '
     'diambil siapa pun &mdash; lihat <code>.agents/4-DESIGN-SYSTEM.md</code> &sect;7.</p></div>',
     w=1000)

# ------------------------------------------------------------------- safety
_felt = """<div style="background:var(--color-tint-pink);border-radius:var(--radius-curhat);padding:22px">
<p style="margin:0;font:700 16px var(--sans)">Setelah baca balasan yang masuk, kamu merasa didengar?</p>
<p style="margin:8px 0 0;font-size:13px;color:var(--color-muted)">Jawaban kamu cuma buat kami, nggak kelihatan ke siapa pun.</p>
<div class="col" style="margin-top:16px;gap:8px">
<button class="btn btn-secondary" style="width:100%">Iya, lumayan bikin lega</button>
<button class="btn btn-secondary" style="width:100%">Sedikit</button>
<button class="btn btn-secondary" style="width:100%">Belum, sih</button></div>
<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border);text-align:center">
<button class="btn btn-ghost">Nggak sekarang</button></div></div>"""
_destr = """<div style="border:2px solid var(--color-danger);border-radius:var(--radius-curhat);padding:22px;background:var(--color-surface)">
<p style="margin:0;font:800 16px var(--sans)">Yakin mau nutup akunmu?</p>
<ul style="margin:12px 0 0;padding-left:18px;font-size:13.5px;line-height:1.7;color:var(--color-muted)">
<li>Semua curhat kamu akan dihapus permanen.</li>
<li>Ruang ngobrol yang pernah kamu buka ikut hilang.</li>
<li>Ini nggak bisa dibatalkan.</li></ul>
<input class="field" style="margin-top:14px" placeholder="Ketik: HAPUS AKUN">
<div class="row" style="margin-top:12px">
<button class="btn" style="background:var(--color-danger);color:var(--color-danger-fg)">Hapus akun</button>
<button class="btn btn-secondary">Batal</button></div></div>"""
card("components/safety.html", "Safety", "Felt Heard & konfirmasi destruktif",
     "North Star prompt, DestructiveConfirm", "Safety",
     '<div class="pair">'
     f'<div class="t stage"><p class="lbl">FeltHeardSheet</p>{_felt}</div>'
     f'<div class="t-dark stage"><p class="lbl">DestructiveConfirm</p>{_destr}</div>'
     '</div><div class="t"><p class="note"><b>Ketiga jawaban Felt Heard dirender identik.</b> '
     'Membuat &ldquo;Belum, sih&rdquo; lebih pelan dari &ldquo;Iya&rdquo; akan membengkokkan North '
     'Star lewat desain. Tombol dismiss dipisah garis dan dibacakan sebagai &ldquo;Lewati '
     'pertanyaan ini, jangan hitung sebagai jawaban&rdquo;.</p>'
     '<p class="note"><b>Konsekuensi selalu dirender di atas tombol</b>, dan urutannya dicek lewat '
     'posisi DOM. Frasa konfirmasi harus diketik persis: sebuah checkbox cuma satu ketukan.</p>'
     '<p class="note"><code>danger</code> #7E2F0C berjarak <b>42&deg; hue</b> dari rose. Merah lama '
     '#B3261E cuma 11&deg;. Jarak minimum 25&deg; dikunci test.</p></div>', w=1000)

# -------------------------------------------------------------------- write
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "README.md").write_text(
    "# CURHAT DONG — Design System\n\n"
    "Preview komponen web, dibangkitkan dari `apps/web/components/`.\n"
    "Nilai token disalin dari `apps/web/lib/tokens.ts` dan ditegakkan oleh\n"
    "`lib/contrast.test.ts`, `lib/css-tokens.test.ts`, `lib/vocabulary.test.ts`.\n\n"
    "Dokumen naratifnya: `.agents/4-DESIGN-SYSTEM.md`.\n"
    "Cara mendorong ulang: `docs/DESIGN-SYNC.md`.\n\n"
    "Aturan yang menopang seluruh sistem: **rose dalam mikul aksi, pink terang\n"
    "mikul identitas** — putih di atas `brand` #FA4B7D hanya 3.30:1.\n",
    encoding="utf-8")
(OUT / "cards.json").write_text(json.dumps(CARDS, indent=1, ensure_ascii=False), encoding="utf-8")

print(f"Nunito embedded: {'yes' if FONT_B64 else 'NO — run a web build first'}")
print(f"{len(CARDS)} cards -> {OUT}")
for c in CARDS:
    size = (OUT / c["path"]).stat().st_size // 1024
    print(f"  {c['group']:14} {c['path']:38} {size:>4} KB")
