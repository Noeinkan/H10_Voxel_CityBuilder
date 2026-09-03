import { AUTO_SLOT, MANUAL_SLOTS, type SlotInfo } from '../game/save/storage';
import { EMPTY_SLOT_SUMMARY, slotLabel, slotSummary } from './MainMenuModel';
import { titleGroup, titleNote, titleRow, titleSection, titleSmall } from './titleBits';

/**
 * La sezione dei salvataggi: quattro slot, e le due porte verso un file.
 *
 * **Non tiene stato di gioco e non conosce lo storage.** Riceve l'elenco degli
 * slot gia' letto e restituisce gesti — salva qui, carica questo, cancella
 * quello, esporta, importa — esattamente come `PoliciesDrawer` riceve un modello
 * e restituisce l'id di una policy. Chi ha in mano la partita sta altrove, ed e'
 * l'unico che puo' deciderne il destino.
 *
 * **Lo slot automatico si carica ma non si scrive a mano.** Lo riscrive il gioco
 * ogni venti secondi: un bottone «salva qui» sopra prometterebbe una copia che
 * il tick successivo si porta via. I tre a mano sono l'opposto — nessuno li
 * tocca se non chi li ha scritti — ed e' la differenza che rende utile averli
 * entrambi.
 */

export interface SaveSectionHandlers {
  readonly onSave: (slot: string) => void;
  readonly onLoad: (slot: string) => void;
  readonly onDelete: (slot: string) => void;
  readonly onExport: () => void;
  readonly onImport: (text: string) => void;
}

interface SlotRow {
  readonly root: HTMLElement;
  readonly summary: HTMLElement;
  readonly load: HTMLButtonElement;
  readonly remove: HTMLButtonElement;
}

export class MainMenuSaves {
  readonly root: HTMLElement;

  private readonly rows = new Map<string, SlotRow>();
  private readonly note = titleNote(
    'A JSON file carries the whole city: seed, simulation and every building.',
  );
  private readonly fileInput: HTMLInputElement;
  private latest: readonly SlotInfo[] = [];

  constructor(private readonly handlers: SaveSectionHandlers) {
    this.root = titleSection();

    this.root.appendChild(titleGroup('Autosave'));
    this.root.appendChild(this.createRow(AUTO_SLOT, false).root);

    this.root.appendChild(titleGroup('Slots'));
    for (const slot of MANUAL_SLOTS) {
      this.root.appendChild(this.createRow(slot, true).root);
    }

    this.root.appendChild(titleGroup('File'));
    this.root.appendChild(this.note);

    const fileRow = titleRow();
    fileRow.appendChild(this.wideButton('Export JSON', () => handlers.onExport()));

    // L'input sta nascosto e lo apre il bottone: un `<input type="file">` nudo
    // non si puo' vestire come il resto della colonna, e il gesto e' comunque il suo.
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => this.readChosenFile());
    fileRow.appendChild(this.wideButton('Import JSON', () => this.fileInput.click()));
    fileRow.appendChild(this.fileInput);
    this.root.appendChild(fileRow);
  }

  /** Ridisegna le righe da un elenco gia' letto dallo storage. */
  paint(slots: readonly SlotInfo[]): void {
    this.latest = slots;
    for (const [slot, row] of this.rows) {
      const info = slots.find((entry) => entry.slot === slot) ?? null;
      row.summary.textContent = info === null ? EMPTY_SLOT_SUMMARY : slotSummary(info);
      row.load.disabled = info === null;
      row.remove.disabled = info === null;
    }
  }

  /** Ridipinge l'ultimo elenco ricevuto: lo chiama chi riapre la sezione. */
  repaint(): void {
    this.paint(this.latest);
  }

  /** Una riga di esito sotto le porte verso il file: fallimenti compresi. */
  setNote(text: string): void {
    this.note.textContent = text;
  }

  private createRow(slot: string, manual: boolean): SlotRow {
    const root = document.createElement('div');
    root.className = 'title-slot';

    const text = document.createElement('div');
    text.className = 'title-slot-text';
    const name = document.createElement('span');
    name.className = 'title-slot-name';
    name.textContent = slotLabel(slot);
    const summary = document.createElement('span');
    summary.className = 'title-slot-summary';
    summary.textContent = EMPTY_SLOT_SUMMARY;
    text.append(name, summary);

    const actions = document.createElement('div');
    actions.className = 'title-slot-actions';
    if (manual) actions.appendChild(titleSmall('Save', () => this.handlers.onSave(slot)));
    const load = titleSmall('Load', () => this.handlers.onLoad(slot));
    actions.appendChild(load);
    const remove = titleSmall('Delete', () => this.handlers.onDelete(slot));
    actions.appendChild(remove);

    root.append(text, actions);
    const row: SlotRow = { root, summary, load, remove };
    this.rows.set(slot, row);
    return row;
  }

  /** I due gesti sul file si dividono la riga: sono scelte pari fra loro. */
  private wideButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = titleSmall(label, onClick);
    button.classList.add('title-small--wide');
    return button;
  }

  /**
   * Legge il file scelto e lo consegna come testo.
   *
   * Il valore dell'input si azzera dopo: senza, riscegliere **lo stesso** file
   * non emette un secondo `change`, e il secondo tentativo di importare sembra
   * ignorato.
   */
  private readChosenFile(): void {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (file === undefined) return;
    file.text()
      .then((text) => this.handlers.onImport(text))
      .catch(() => this.setNote('That file could not be read.'));
  }
}
