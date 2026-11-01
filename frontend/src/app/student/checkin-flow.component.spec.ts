import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../core/api.service';
import { CheckinFlowComponent } from './checkin-flow.component';
import type { PublicSessionDto } from '../core/api.models';

const SESSION: PublicSessionDto = {
  code: 'ABC234', courseCode: 'CENG101', courseName: 'Giriş', title: 'Hafta 5', status: 'OPEN',
  refreshMs: 1000, requiredScans: 3, geoMode: 'OFF', bleMode: 'OFF', frameCapture: true,
  privacyNotice: 'not', studentNoPattern: '^[0-9]{5,12}$',
};

class FakeApi {
  session: PublicSessionDto | Error = SESSION;
  startError: unknown = null;
  started: string[] = [];
  scanReplies: { valid: boolean; distinctValid: number; required: number; complete: boolean }[] = [];
  async getPublicSession() { if (this.session instanceof Error) throw this.session; return this.session; }
  async startCheckin(_code: string, no: string) {
    if (this.startError) throw this.startError;
    this.started.push(no);
    return { attemptId: 'a1', expiresAt: '2026-10-20T09:03:00Z', studentName: 'Ayşe' };
  }
  async scanCheckin() { return this.scanReplies.shift()!; }
}

const scan = (seq: number) => ({
  token: `Y1.ABC234.${seq}.MGJ6K3CW.77B7SI2E54AA2`, seq, firstSeenServerMs: 0, frameTimeSource: 'callback',
  frameW: 640, frameH: 480, corners: null,
});
const flush = () => new Promise(r => setTimeout(r, 0));

describe('CheckinFlowComponent', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  });

  async function create() {
    const fixture = TestBed.createComponent(CheckinFlowComponent);
    fixture.componentRef.setInput('code', 'abc234');
    await fixture.componentInstance.ngOnInit();
    return fixture.componentInstance;
  }

  it('loading → enterNo for an open session', async () => {
    expect((await create()).state()).toBe('enterNo');
  });

  it('closed session', async () => {
    api.session = { ...SESSION, status: 'CLOSED' };
    expect((await create()).state()).toBe('closed');
  });

  it('unknown code', async () => {
    api.session = Object.assign(new Error('x'), { code: 'SESSION_NOT_FOUND', message: 'Yoklama bulunamadı.' });
    expect((await create()).state()).toBe('notFound');
  });

  it('rejects a malformed student number locally', async () => {
    const c = await create();
    c.studentNo = '12';
    await c.startCheckin();
    expect(c.state()).toBe('enterNo');
    expect(c.flowError()).not.toBe('');
    expect(api.started).toEqual([]);
  });

  it('enterNo → intro after a successful start', async () => {
    const c = await create();
    c.studentNo = ' 220201001 ';
    await c.startCheckin();
    expect(api.started).toEqual(['220201001']);
    expect(c.state()).toBe('intro');
  });

  it('shows the server message on a start error', async () => {
    api.startError = { code: 'NOT_IN_ROSTER', message: 'Bu öğrenci numarası dersin listesinde yok.' };
    const c = await create();
    c.studentNo = '220201001';
    await c.startCheckin();
    expect(c.state()).toBe('enterNo');
    expect(c.flowError()).toBe('Bu öğrenci numarası dersin listesinde yok.');
  });

  it('keeps the roster name from the start response', async () => {
    const c = await create();
    c.studentNo = '220201001';
    await c.startCheckin();
    expect(c.studentName()).toBe('Ayşe');
  });

  it('progress follows the server-validated count, not local decodes', async () => {
    api.scanReplies = [
      { valid: true, distinctValid: 1, required: 3, complete: false },
      { valid: false, distinctValid: 1, required: 3, complete: false },   // e.g. TOKEN_EXPIRED
    ];
    const c = await create();
    const flow = c as unknown as { onScanEvent(e: ReturnType<typeof scan>): void };
    flow.onScanEvent(scan(1));
    flow.onScanEvent(scan(2));
    await flush(); await flush();
    expect(c.validCount()).toBe(1);
  });

  it('a session that closed meanwhile shows the closed screen', async () => {
    api.startError = { code: 'SESSION_NOT_OPEN', message: 'Bu yoklama şu anda açık değil.' };
    const c = await create();
    c.studentNo = '220201001';
    await c.startCheckin();
    expect(c.state()).toBe('closed');
  });
});
