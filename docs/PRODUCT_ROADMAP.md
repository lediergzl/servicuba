# ServiCuba — Roadmap de producto

## Objetivo
Convertir ServiCuba en un marketplace local de servicios, no en un clasificado general.

## P0 — Integridad y estabilidad
- [x] Landing pública responsive con dos públicos: Cliente y Trabajador.
- [x] Navegación Login/Registro → Inicio sin recarga.
- [x] Restaurar exports compartidos de geolocalización.
- [x] Validación de registro y exposición de errores 422.
- [x] Evitar que el publicador se postule/solicite su propia publicación.
- [x] Permitir múltiples postulaciones mientras la publicación está ACTIVA.
- [x] Al asignar una persona, cerrar la publicación y rechazar las postulaciones restantes.
- [x] Índice único para impedir postulaciones duplicadas.
- [x] Moderación y denuncias iniciales.

## P1 — Modelo correcto del marketplace
- [x] Diferenciar `necesidad` (cliente busca ayuda) de `oferta` (trabajador ofrece servicio).
- [ ] Separar claramente en UX: Tarea, Servicio, Anuncio y Perfil profesional.
- [ ] Reglas de publicación por categoría para evitar contenido tipo clasificado general.
- [ ] Flujo profesional para activar perfil de Trabajador.
- [ ] Plan Free: buscar/contratar sin necesidad de publicar servicios.
- [ ] Plan Base: publicar servicios con límite diario.
- [ ] Plan Premium: mayor visibilidad y anuncios/promociones.
- [ ] Mostrar plan y límites reales en el perfil/dashboard.

## P2 — Reputación verificable
- [x] Una opinión máxima por trabajo.
- [x] La opinión sólo puede realizarse sobre una relación de trabajo confirmada.
- [ ] Evaluar por dimensiones: trabajo, trato, puntualidad y precio acordado.
- [ ] Pregunta de recomendación.
- [ ] Mostrar cantidad de trabajos evaluados junto a la estrella.
- [ ] Opiniones verificadas visibles en el perfil profesional.
- [ ] Denunciar una opinión.

## P3 — Moderación
- [x] Modelo de denuncias.
- [x] Endpoint público de denuncia.
- [x] Cola administrativa inicial.
- [ ] Moderar también anuncios, servicios y opiniones, no sólo tareas.
- [ ] Estados de moderación y auditoría completos.
- [ ] Suspensión/restricción por reincidencia.
- [ ] Reglas de contenido prohibido/restringido.

## P4 — UX viva
- [ ] Encabezado contextual por modo Cliente/Trabajador.
- [ ] KPIs reales.
- [ ] Actividad reciente real.
- [ ] Estados de tareas/servicios/postulaciones visibles.
- [ ] Skeletons.
- [ ] Tarjetas informativas con datos reales.
- [ ] Ubicación/actividad viva.
- [ ] Notificaciones.
- [ ] Mensajes.
- [ ] Actualización automática.
- [ ] Feedback visual de cada acción.
- [ ] Diferencias claras entre experiencia Cliente y Trabajador.

## P5 — Monetización
- [ ] Entitlement de plan Base/Premium.
- [ ] Límites diarios/semanales server-side.
- [ ] Promociones/anuncios Premium.
- [ ] Destacados y prioridad de visibilidad.
- [ ] Expiración y renovación de planes.
- [ ] Panel administrativo de planes y métricas.

## P6 — Lanzamiento
- [ ] Eliminar datos de prueba.
- [ ] Crear datos de demostración sólo donde corresponda.
- [ ] Smoke tests completos Cliente/Trabajador.
- [ ] Revisar consola frontend sin imports rotos.
- [ ] Revisar endpoints 4xx/5xx.
- [ ] Verificar permisos y moderación.
- [ ] Verificar Render/producción.
