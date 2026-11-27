# Come pubblicare un aggiornamento

A ogni modifica aumentare **insieme** questi tre numeri, così l'app sul telefono si aggiorna da sola:

1. `version.txt` (es. `19` → `20`)
2. `APP_VERSION` in `app.js`
3. `CACHE` in `sw.js` (es. `idraulico-v19` → `idraulico-v20`)
