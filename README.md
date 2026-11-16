# Agenda Idraulico

App per iPhone (web app) per gestire impegni, lavori, materiali e conti.

## Installazione su iPhone
1. Apri il link dell'app con **Safari**.
2. Tocca **Condividi** (quadrato con la freccia) → **Aggiungi alla schermata Home**.
3. Apri l'app dall'icona: funziona anche senza internet.

## Cosa fa
- **Agenda**: calendario con gli impegni del giorno e i prossimi.
- **Preventivi** (in Lavori → Preventivi, o dal +): voci, IVA, PDF da inviare al cliente; quando accetta si crea il lavoro già compilato.
- **Lavori**: cliente, telefono, indirizzo, ore (con cronometro), materiali, importo e pagamento.
- **Soldi**: entrate, uscite e saldo del mese; elenco di quanto resta da incassare.
- **Materiali**: storico con marca, quantità, prezzo, fornitore; confronto prezzi per articolo.
- **Riepilogo**: utile, ore lavorate, mese per mese, clienti e materiali principali; backup ed esportazione CSV.

## I dati
I dati restano **solo sul telefono**. Fai ogni tanto **Riepilogo → Salva backup** e conserva il file (iCloud, WhatsApp, email).

## Librerie
- [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (licenza MIT, in `vendor/`) per creare i PDF dei preventivi.
