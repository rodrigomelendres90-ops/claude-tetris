---
name: weather
description: Obtiene el clima actual (temperatura, condicion, viento, humedad) para una ciudad o para la ubicacion detectada por IP. Usar cuando el usuario pregunte por el clima, tiempo, temperatura, pronostico, o invoque /weather o /clima.
---

# Weather

Consulta el clima usando el servicio publico `wttr.in`, que no requiere API key ni configuracion.

## Uso

1. Si el usuario especifico una ciudad, usala. Si no, deja la ciudad vacia para que `wttr.in` detecte la ubicacion por IP.
2. Ejecuta con el Bash tool (formato compacto de una linea, `format=3` da `Ciudad: condicion temperatura`):

```bash
curl -s "wttr.in/CIUDAD?format=3"
```

   Reemplaza `CIUDAD` por el nombre de la ciudad (usa `+` en vez de espacios, ej. `Buenos+Aires`) o deja `wttr.in/?format=3` sin ciudad para autodetectar por IP.

3. Para un reporte mas detallado (temperatura, sensacion termica, viento, humedad, condicion) en texto plano, sin colores ANSI:

```bash
curl -s "wttr.in/CIUDAD?format=%l:+%C+%t+(sensacion+%f)+%h+humedad+%w+viento&m"
```

   `&m` fuerza unidades metricas (Celsius, km/h).

4. Si el usuario pide un pronostico de varios dias, usa el reporte por defecto (sin `format`), pero limitado a texto plano:

```bash
curl -s "wttr.in/CIUDAD?m&T"
```

   `&T` desactiva colores ANSI para que el output sea legible en la terminal.

5. Si `curl` falla o no esta disponible (por ejemplo en PowerShell puro), usa como alternativa:

```powershell
Invoke-RestMethod -Uri "https://wttr.in/CIUDAD?format=3"
```

## Notas

- No hace falta API key: `wttr.in` es gratuito y publico.
- Si el usuario no da ciudad, la deteccion por IP puede ser imprecisa (sobre todo con VPN); en ese caso ofrece pedirle la ciudad explicitamente.
- Presenta el resultado al usuario en una linea o pocas lineas, sin agregar interpretaciones innecesarias.
