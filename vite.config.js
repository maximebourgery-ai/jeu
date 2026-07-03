import { defineConfig } from 'vite';

export default defineConfig({
  // Serveur de dev accessible depuis le réseau local (utile pour tester la
  // manette smartphone ?controller=ID depuis un téléphone).
  server: { host: true },
  build: {
    // three.js est volumineux : on relève simplement le seuil d'avertissement.
    chunkSizeWarningLimit: 1500
  }
});
