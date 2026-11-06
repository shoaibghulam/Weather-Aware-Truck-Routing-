import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre 6 loads its web worker from a URL next to its own module. Vite renames and
// bundles that module in production builds, so the worker would 404 under /static/.
// Importing it with `?url` makes Vite emit the file and gives us its final URL.
setWorkerUrl(workerUrl)
