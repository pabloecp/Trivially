# Cómo trabajamos con Git

Usamos **Git Flow** simplificado: dos ramas permanentes y todo cambio entra por una rama propia y un pull request. Nadie sube directamente a `main` ni a `develop`.

## Ramas permanentes

| Rama | Para qué sirve | Despliegue |
| --- | --- | --- |
| `main` | Producción. Solo contiene lo que ya está probado y publicado. | Vercel y Railway despliegan desde aquí. |
| `develop` | Integración. Aquí se junta y se prueba todo lo nuevo antes de publicarlo. | Vista previa de Vercel (si está activada). |

## Ramas de trabajo

Se crean siempre desde `develop` (menos `hotfix/`, que sale de `main`) y se borran al fusionarlas.

| Prefijo | Para qué | Ejemplo | Sale de | Entra en |
| --- | --- | --- | --- | --- |
| `feature/` | Algo nuevo | `feature/modo-eliminacion` | `develop` | `develop` |
| `fix/` | Arreglar un fallo | `fix/texto-barra-movil` | `develop` | `develop` |
| `chore/` | Mantenimiento, documentación, herramientas | `chore/actualizar-dependencias` | `develop` | `develop` |
| `release/` | Preparar una publicación | `release/2026-11-03` | `develop` | `main` (y de vuelta a `develop`) |
| `hotfix/` | Arreglo urgente en producción | `hotfix/sala-no-abre` | `main` | `main` (y también `develop`) |

Nombres en minúsculas, con guiones y sin espacios.

## El día a día

```bash
# 1. Empezar algo nuevo, siempre desde develop al día
git checkout develop
git pull origin develop
git checkout -b feature/mi-cambio

# 2. Trabajar y hacer commits (en español, ver CLAUDE.md)
git add -A
git commit -m "Título corto" -m "- Qué cambió, en palabras simples"

# 3. Subir la rama y abrir un pull request hacia develop
git push -u origin feature/mi-cambio
```

Después, en GitHub: **pull request de `feature/mi-cambio` hacia `develop`**. Cuando alguien lo revisa y los checks pasan, se fusiona y se borra la rama.

Antes de abrir el pull request:

- `npm test --prefix backend` y `npm run build --prefix frontend` deben pasar.
- Si los tests tocan `backend/data/store.json`, restáuralo (`git checkout backend/data/store.json`).

## Publicar en producción (release)

1. Cuando `develop` tiene lo que queremos publicar y está probado, se abre un pull request de `develop` hacia `main` (o de una rama `release/fecha` si hace falta preparar algo antes).
2. Se fusiona con un **merge commit** (no squash), para que `main` conserve el historial.
3. Vercel y Railway despliegan solos desde `main`.
4. Si la publicación necesita algo manual (por ejemplo, ejecutar SQL en Supabase), va escrito en la descripción del pull request.

## Arreglos urgentes (hotfix)

Para algo roto en producción que no puede esperar a la siguiente publicación:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/descripcion
# arreglar, commit, push
```

Pull request hacia `main`. Una vez fusionado, hay que **llevar el mismo arreglo a `develop`** (un pull request de `main` hacia `develop`, o `git merge origin/main` en una rama de trabajo) para que no se pierda en la siguiente publicación.

## Ramas personales antiguas

Las ramas con nombre de persona (`dani`, `pablo`, `jonathan`…) ya no se usan para trabajar: cada cambio va en su rama `feature/`, `fix/` o `chore/`. Las antiguas se pueden borrar cuando no tengan nada pendiente de fusionar.

## Reglas de GitHub recomendadas

En *Settings → Branches*, para `main` y `develop`:

- Exigir pull request antes de fusionar (sin subidas directas).
- Exigir que pase el check **CI** (tests y build).
- Pedir al menos una aprobación en `main`.
- No permitir *force push* ni borrar las ramas.
- En *Settings → General*, dejar `develop` como rama por defecto, para que los pull requests nuevos apunten ahí.
