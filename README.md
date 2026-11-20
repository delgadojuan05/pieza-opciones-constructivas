# Pieza · Tres opciones constructivas

Visor 3D arquitectónico para comparar tres alternativas, desarmar sus sistemas y explorar sus componentes.

## Uso

- Elegí una opción o compará las tres.
- Arrastrá hacia arriba para desarmar; hacia abajo para armar. También podés usar el deslizador con teclado.
- Elegí Girar o usá el botón derecho para rotar.
- Seleccioná un componente para consultar sus dimensiones, aislarlo o explorar sus piezas.

## Datos

El modelo conserva los 1.352 sólidos extraídos de Drawing2.dwg: 31 sistemas y 31.008 triángulos. Una unidad del dibujo equivale a un metro, según confirmación del autor. Las alternativas siguen el orden de menor a mayor X del CAD. Los colores y el desplazamiento del despiece son ilustrativos; las dimensiones mostradas son cajas envolventes.

## Publicación

Sitio estático compatible con GitHub Pages desde la raíz de main. No requiere servidor ni dependencias de compilación. El modelo se descarga comprimido y se descomprime en el navegador. El JSON sin comprimir se mantiene como alternativa para navegadores sin DecompressionStream.

Para una vista previa local, serví esta carpeta con un servidor HTTP.

Three.js y OrbitControls se distribuyen con su licencia MIT en vendor/THREE-LICENSE.txt. La geometría del proyecto no se distribuye bajo esa licencia.
