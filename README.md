# LAMULA-WebViewer

Visualizador web de productos de radar NEXRAD Level III. Reescritura del viewer legado [VestaWeb2](https://github.com/vladimir1284/VestaWeb2) como aplicación **Nuxt 3 (Vue 3)** sobre **Cloudflare Pages**, consumiendo los almacenes que escribe [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline): COGs calibrados en R2 (renderizados en el navegador con OpenLayers WebGL) y catálogo/metadata/fenómenos/VWP en D1 (leída vía binding de las server routes).

Proyecto de **solo lectura**: no genera ni persiste datos. El contrato de datos (schema D1 + layout R2) lo posee el pipeline.

**Estado: planificación.** El plan reconciliado completo (arquitectura, decisiones, contrato, fases) está en `docs/` (MkDocs Material), desplegado automáticamente a Cloudflare Pages.

Preview local de la documentación:

```bash
uvx --with mkdocs-material mkdocs serve   # http://localhost:8000
```
