"""Genera i manuali PDF: python scripts/manuali/build.py pc|telefono
Usa i frammenti HTML in scripts/manuali/contenuto/<manuale>-*.html (in ordine alfabetico). Richiede `pip install playwright` + chromium."""
import sys, html, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
MANUALI = {
    "pc": dict(titolo='Quiz del <em>Pozzo</em>', sotto="Manuale di gioco · versione PC (TV + telefoni)", dati=[("14", "giochi"), ("2-16", "giocatori"), ("0", "internet necessario")], out="Quiz-del-Pozzo-Manuale-PC.pdf"),
    "telefono": dict(titolo='Party <em>Tascabile</em>', sotto="Manuale di gioco · versione telefono (un telefono per tutto il tavolo)", dati=[("8", "giochi"), ("2-16", "giocatori"), ("1", "telefono")], out="Party-Tascabile-Manuale-Telefono.pdf"),
}

def main(nome):
    m = MANUALI[nome]
    parti = sorted((ROOT / "contenuto").glob(f"{nome}-*.html"))
    if not parti:
        sys.exit(f"Nessun frammento contenuto/{nome}-*.html")
    corpo = "\n".join(p.read_text(encoding="utf-8") for p in parti)
    dati = "".join(f"<div><b>{html.escape(a)}</b>{html.escape(b)}</div>" for a, b in m["dati"])
    pagina = f"""<!doctype html><html lang="it"><head><meta charset="utf-8"><title>{html.escape(m['out'])}</title>
<style>{(ROOT / 'manuale.css').read_text(encoding='utf-8')}</style></head><body>
<section class="copertina"><div class="marchio">{m['titolo']}</div><div class="sotto">{html.escape(m['sotto'])}</div><div class="dati">{dati}</div></section>
<section class="indice"><h1>Indice</h1><ol id="toc"></ol></section>
{corpo}
<script>const t=document.getElementById('toc');document.querySelectorAll('h1, .gioco > h2').forEach(h=>{{if(h.closest('.indice'))return;const li=document.createElement('li');li.textContent=h.textContent;if(h.tagName==='H2')li.style.marginLeft='6mm';t.appendChild(li);}});</script>
</body></html>"""
    out = ROOT.parent.parent / "docs" / "manuali" / m["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    html_path = ROOT / f"_{nome}.html"
    html_path.write_text(pagina, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(html_path.as_uri())
        pg.pdf(path=str(out), format="A4", print_background=True, prefer_css_page_size=True,
               display_header_footer=True, header_template="<span></span>",
               footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>')
        b.close()
    html_path.unlink()
    print("OK", out)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
