import { Component, computed, input, OnInit, output, signal } from '@angular/core';
import type { ExamDto, ExamResultDto, RosterEntryDto } from '../core/api.models';
import { getItem, setItem } from '../core/storage';
import {
  availableColumns, buildCsv, CsvSeparator, DEFAULT_OPTIONS, ExportOptions, exportFilename, placeColumn, restoreSelection,
} from './exam-export.logic';

const STORAGE_KEY = 'yoklama.examExport';

interface SavedLayout { columns: string[]; options: ExportOptions; }

/** Column picker for the grade CSV: drag columns into the export list and reorder them; only those are written. */
@Component({
  selector: 'app-exam-export-dialog',
  template: `
    <div class="dialog-backdrop" (click)="closed.emit()">
      <div class="dialog export" role="dialog" aria-modal="true" aria-labelledby="x-title" (click)="$event.stopPropagation()" (keydown.escape)="closed.emit()">
        <h2 class="dialog-title" id="x-title">Not dışa aktar (CSV)</h2>
        <p class="text-sm text-secondary help">Sütunları sağdaki listeye sürükleyin ve sırayı sürükleyerek ayarlayın. Yalnızca sağdaki sütunlar, bu sırayla dışa aktarılır.</p>

        <div class="lists">
          <section class="list-box" aria-labelledby="x-avail">
            <h3 id="x-avail">Kullanılabilir sütunlar</h3>
            <ul class="col-list" (dragover)="allowDrop($event)" (drop)="dropOnAvailable($event)">
              @for (c of unselected(); track c.key) {
                <li class="col-item" draggable="true" (dragstart)="dragStart($event, c.key)" (dragend)="dragEnd()" [class.dragging]="dragKey() === c.key">
                  <span class="col-label">{{ c.label }}</span>
                  <button type="button" class="btn-icon" (click)="add(c.key)" [attr.aria-label]="c.label + ' ekle'" title="Ekle">＋</button>
                </li>
              } @empty {
                <li class="empty-hint text-secondary">Tüm sütunlar seçili.</li>
              }
            </ul>
            @if (hasQuestions()) {
              <div class="flex-gap quick">
                <button type="button" class="btn btn-outline btn-sm" (click)="addGroup('a')">Tüm cevaplar</button>
                <button type="button" class="btn btn-outline btn-sm" (click)="addGroup('p')">Tüm soru puanları</button>
              </div>
            }
          </section>

          <section class="list-box selected" aria-labelledby="x-sel">
            <h3 id="x-sel">Dışa aktarılacak ({{ selected().length }})</h3>
            <ol class="col-list" (dragover)="allowDrop($event)" (drop)="dropOnSelected($event, selected().length)">
              @for (c of selectedCols(); track c.key; let i = $index) {
                <li class="col-item" draggable="true"
                    (dragstart)="dragStart($event, c.key)" (dragend)="dragEnd()"
                    (dragover)="overItem($event, i)" (drop)="dropOnSelected($event, dropIndex() ?? i); $event.stopPropagation()"
                    [class.dragging]="dragKey() === c.key"
                    [class.drop-before]="dropIndex() === i" [class.drop-after]="dropIndex() === i + 1 && i === selected().length - 1">
                  <span class="handle" aria-hidden="true">⋮⋮</span>
                  <span class="pos">{{ i + 1 }}.</span>
                  <span class="col-label">{{ c.label }}</span>
                  <button type="button" class="btn-icon" (click)="move(c.key, i - 1)" [disabled]="i === 0" [attr.aria-label]="c.label + ' yukarı'" title="Yukarı">↑</button>
                  <button type="button" class="btn-icon" (click)="move(c.key, i + 2)" [disabled]="i === selected().length - 1" [attr.aria-label]="c.label + ' aşağı'" title="Aşağı">↓</button>
                  <button type="button" class="btn-icon text-danger" (click)="remove(c.key)" [attr.aria-label]="c.label + ' çıkar'" title="Çıkar">✕</button>
                </li>
              } @empty {
                <li class="empty-hint text-secondary">Sütunları buraya sürükleyin.</li>
              }
            </ol>
            @if (selected().length) {
              <button type="button" class="btn btn-outline btn-sm" (click)="clear()">Temizle</button>
            }
          </section>
        </div>

        <div class="options">
          <label class="opt"><input type="checkbox" [checked]="options().includeHeader" (change)="setOpt('includeHeader', $any($event.target).checked)" /> Başlık satırı</label>
          <label class="opt"><input type="checkbox" [checked]="options().includeMissing" (change)="setOpt('includeMissing', $any($event.target).checked)" /> Sonucu girilmemiş öğrencileri de ekle</label>
          <label class="opt">Ayırıcı
            <select class="form-input sep" [value]="options().separator" (change)="setOpt('separator', $any($event.target).value)">
              <option value=";">Noktalı virgül ; (Excel TR, ondalık virgül)</option>
              <option value=",">Virgül , (ondalık nokta)</option>
            </select>
          </label>
        </div>

        @if (selected().length) {
          <div class="preview-label text-sm text-secondary">Önizleme ({{ rowCount() }} satır)</div>
          <pre class="preview">{{ preview() }}</pre>
        }

        <div class="flex-gap footer">
          <button type="button" class="btn btn-outline" (click)="closed.emit()">Kapat</button>
          <button type="button" class="btn btn-primary" (click)="download()" [disabled]="!selected().length">CSV indir</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .export { max-width: 760px; max-height: 92vh; overflow: auto; }
    .help { margin-top: 0; }
    .lists { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
    @media (max-width: 640px) { .lists { grid-template-columns: 1fr; } }
    .list-box { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .list-box h3 { font-size: 0.9rem; margin: 0; }
    .col-list { list-style: none; margin: 0; padding: 6px; border: 1px dashed var(--c-border); border-radius: var(--radius-md);
      min-height: 120px; max-height: 280px; overflow: auto; display: flex; flex-direction: column; gap: 4px; background: var(--c-bg); }
    .selected .col-list { border-color: var(--c-primary); background: var(--c-primary-light); }
    .col-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: var(--radius-sm); cursor: grab; font-size: 0.875rem; user-select: none; }
    .col-item.dragging { opacity: 0.4; }
    .col-item.drop-before { box-shadow: inset 0 3px 0 var(--c-primary); }
    .col-item.drop-after { box-shadow: inset 0 -3px 0 var(--c-primary); }
    .col-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .handle { color: var(--c-text-secondary); letter-spacing: -2px; }
    .pos { color: var(--c-text-secondary); min-width: 1.6em; }
    .col-item .btn-icon { padding: 2px 6px; }
    .empty-hint { padding: 12px; text-align: center; font-size: 0.85rem; }
    .quick { flex-wrap: wrap; }
    .options { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: var(--space-md) 0; align-items: center; }
    .opt { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; }
    .sep { width: auto; padding: 4px 8px; }
    .preview { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 8px;
      font-size: 0.8rem; max-height: 140px; overflow: auto; white-space: pre; margin: 4px 0 var(--space-md); }
    .footer { justify-content: flex-end; }
  `],
})
export class ExamExportDialogComponent implements OnInit {
  readonly exam = input.required<ExamDto>();
  readonly roster = input<RosterEntryDto[]>([]);
  readonly results = input<ExamResultDto[]>([]);
  readonly closed = output<void>();

  readonly selected = signal<string[]>([]);
  readonly options = signal<ExportOptions>({ ...DEFAULT_OPTIONS });
  readonly dragKey = signal<string | null>(null);
  readonly dropIndex = signal<number | null>(null);

  readonly columns = computed(() => availableColumns(this.exam()));
  private readonly byKey = computed(() => new Map(this.columns().map(c => [c.key, c])));
  readonly selectedCols = computed(() => this.selected().map(k => this.byKey().get(k)!).filter(Boolean));
  readonly unselected = computed(() => { const s = new Set(this.selected()); return this.columns().filter(c => !s.has(c.key)); });
  readonly hasQuestions = computed(() => this.columns().some(c => c.group === 'question'));
  readonly csv = computed(() => buildCsv(this.exam(), this.roster(), this.results(), this.selected(), this.options()));
  readonly rowCount = computed(() => this.csv().split('\r\n').length - 1 - (this.options().includeHeader ? 1 : 0));
  readonly preview = computed(() => this.csv().replace(/^﻿/, '').split('\r\n').slice(0, 6).join('\n'));

  ngOnInit() {
    let saved: Partial<SavedLayout> | null = null;
    try { saved = JSON.parse(getItem(STORAGE_KEY) ?? 'null'); } catch { saved = null; }
    this.selected.set(restoreSelection(Array.isArray(saved?.columns) ? saved.columns : null, this.columns()));
    if (saved?.options) this.options.set({ ...DEFAULT_OPTIONS, ...saved.options });
  }

  add(key: string) { this.selected.update(s => s.includes(key) ? s : [...s, key]); }
  remove(key: string) { this.selected.update(s => s.filter(k => k !== key)); }
  move(key: string, index: number) { this.selected.update(s => placeColumn(s, key, index)); }
  clear() { this.selected.set([]); }
  addGroup(kind: 'a' | 'p') {
    const keys = this.columns().filter(c => c.group === 'question' && c.key.endsWith(kind)).map(c => c.key);
    this.selected.update(s => [...s, ...keys.filter(k => !s.includes(k))]);
  }
  setOpt<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) {
    this.options.update(o => ({ ...o, [key]: key === 'separator' ? (value as CsvSeparator) : value }));
  }

  dragStart(ev: DragEvent, key: string) {
    this.dragKey.set(key);
    ev.dataTransfer?.setData('text/plain', key);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }
  dragEnd() { this.dragKey.set(null); this.dropIndex.set(null); }
  allowDrop(ev: DragEvent) { if (this.dragKey()) ev.preventDefault(); }

  /** Drop position from the pointer: upper half → before the item, lower half → after it. */
  overItem(ev: DragEvent, i: number) {
    if (!this.dragKey()) return;
    ev.preventDefault();
    const el = ev.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    this.dropIndex.set(ev.clientY < r.top + r.height / 2 ? i : i + 1);
  }

  dropOnSelected(ev: DragEvent, index: number) {
    ev.preventDefault();
    const key = this.dragKey() ?? ev.dataTransfer?.getData('text/plain');
    if (key && this.byKey().has(key)) this.move(key, index);
    this.dragEnd();
  }

  dropOnAvailable(ev: DragEvent) {
    ev.preventDefault();
    const key = this.dragKey();
    if (key) this.remove(key);
    this.dragEnd();
  }

  download() {
    setItem(STORAGE_KEY, JSON.stringify({ columns: this.selected(), options: this.options() } satisfies SavedLayout));
    const blob = new Blob([this.csv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(this.exam());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
