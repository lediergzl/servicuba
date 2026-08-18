-- ServiCuba: reputación multidimensional
-- Ejecutar una vez sobre la base de producción.
-- Los campos son nullable para conservar reseñas históricas.

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS calidad_trabajo INTEGER,
    ADD COLUMN IF NOT EXISTS trato INTEGER,
    ADD COLUMN IF NOT EXISTS puntualidad INTEGER,
    ADD COLUMN IF NOT EXISTS precio_acordado INTEGER;

ALTER TABLE reviews
    ADD CONSTRAINT IF NOT EXISTS ck_reviews_calidad
        CHECK (calidad_trabajo IS NULL OR calidad_trabajo BETWEEN 1 AND 5),
    ADD CONSTRAINT IF NOT EXISTS ck_reviews_trato
        CHECK (trato IS NULL OR trato BETWEEN 1 AND 5),
    ADD CONSTRAINT IF NOT EXISTS ck_reviews_puntualidad
        CHECK (puntualidad IS NULL OR puntualidad BETWEEN 1 AND 5),
    ADD CONSTRAINT IF NOT EXISTS ck_reviews_precio
        CHECK (precio_acordado IS NULL OR precio_acordado BETWEEN 1 AND 5);
