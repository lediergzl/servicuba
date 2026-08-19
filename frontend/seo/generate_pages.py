from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public-seo"
OUT.mkdir(exist_ok=True)
CITIES = ["La Habana", "Santiago de Cuba", "Holguín", "Camagüey", "Santa Clara"]
SERVICES = ["electricistas", "plomeros", "reparadores", "albaniles", "pintores"]
SERVICE_NAMES = {"electricistas": "Electricistas", "plomeros": "Plomeros", "reparadores": "Reparadores", "albaniles": "Albañiles", "pintores": "Pintores"}
TEMPLATE = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{service} en {city} | ServiCuba</title>
<meta name="description" content="Encuentra {service_lower} en {city}. ServiCuba conecta personas que necesitan un servicio con trabajadores locales.">
<link rel="canonical" href="https://servicuba.onrender.com/servicios/{slug}/{city_slug}">
<meta property="og:type" content="website"><meta property="og:title" content="{service} en {city} | ServiCuba"><meta property="og:description" content="Servicios locales de {service_lower} en {city}.">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebPage","name":"{service} en {city} | ServiCuba","description":"Encuentra {service_lower} en {city}.","url":"https://servicuba.onrender.com/servicios/{slug}/{city_slug}"}}</script>
</head>
<body>
<main>
<nav aria-label="Migas de pan"><a href="/">ServiCuba</a> / <a href="/servicios/{slug}/{first_city_slug}">{service}</a> / {city}</nav>
<h1>{service} en {city}</h1>
<p>Encuentra y contacta trabajadores locales para servicios de {service_lower} en {city}.</p>
<p>ServiCuba conecta personas que necesitan resolver un problema con trabajadores que ofrecen sus servicios. Puedes explorar por municipio y decidir cuándo registrarte.</p>
<h2>Servicios locales en {city}</h2>
<p>Busca profesionales para reparaciones, mantenimiento y trabajos relacionados con {service_lower} en tu municipio.</p>
<h2>También puedes buscar {service_lower} en</h2>
<ul>{city_links}</ul>
<h2>Otros servicios en {city}</h2>
<ul>{service_links}</ul>
<p><a href="/">Volver a ServiCuba</a></p>
</main>
</body>
</html>
"""

urls = []
for city in CITIES:
    city_slug = city.lower().replace(" ", "-")
    city_links = []
    for other_city in CITIES:
        other_slug = other_city.lower().replace(" ", "-")
        city_links.append(f'<li><a href="/servicios/{{slug}}/{other_slug}">{escape(other_city)}</a></li>')
    for service in SERVICES:
        service_name = SERVICE_NAMES[service]
        path = OUT / "servicios" / service / city_slug
        path.mkdir(parents=True, exist_ok=True)
        service_links = []
        for other_service in SERVICES:
            if other_service == service:
                continue
            service_links.append(f'<li><a href="/servicios/{other_service}/{city_slug}">{escape(SERVICE_NAMES[other_service])}</a></li>')
        html = TEMPLATE.format(
            service=escape(service_name),
            service_lower=escape(service_name.lower()),
            city=escape(city),
            slug=service,
            city_slug=city_slug,
            first_city_slug=CITIES[0].lower().replace(" ", "-"),
            city_links="".join(city_links).replace("{slug}", service),
            service_links="".join(service_links),
        )
        (path / "index.html").write_text(html, encoding="utf-8")
        urls.append(f"https://servicuba.onrender.com/servicios/{service}/{city_slug}")

sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '  <url><loc>https://servicuba.onrender.com/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>']
sitemap.extend(f'  <url><loc>{url}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>' for url in urls)
sitemap.append('</urlset>')
(OUT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
print(f"Generated {len(urls)} SEO pages and sitemap")
