from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public-seo"
OUT.mkdir(exist_ok=True)
CITIES = ["La Habana", "Santiago de Cuba", "Holguín", "Camagüey", "Santa Clara"]
SERVICES = ["electricistas", "plomeros", "reparadores", "albaniles", "pintores"]
TEMPLATE = """<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{service} en {city} | ServiCuba</title><meta name=\"description\" content=\"Encuentra servicios de {service} en {city}. ServiCuba conecta personas con trabajadores locales.\"><link rel=\"canonical\" href=\"https://servicuba.onrender.com/servicios/{slug}/{city_slug}\"></head><body><main><h1>{service} en {city}</h1><p>ServiCuba conecta personas que necesitan un servicio con trabajadores locales. Explora servicios disponibles en {city}.</p><p><a href=\"/\">Volver a ServiCuba</a></p></main></body></html>\n"""
for city in CITIES:
    city_slug = city.lower().replace(" ", "-")
    for service in SERVICES:
        path = OUT / "servicios" / service / city_slug
        path.mkdir(parents=True, exist_ok=True)
        (path / "index.html").write_text(TEMPLATE.format(service=service.capitalize(), city=city, slug=service, city_slug=city_slug), encoding="utf-8")
print(f"Generated {len(CITIES) * len(SERVICES)} SEO pages")
