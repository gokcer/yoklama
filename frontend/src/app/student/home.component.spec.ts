import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function input(value: string) {
    const el = document.createElement('input');
    el.value = value;
    return el;
  }

  it('upper-cases and drops characters outside the code alphabet', () => {
    const c = TestBed.createComponent(HomeComponent).componentInstance;
    const el = input('ab-c 2o34x');
    c.onInput(el);
    expect(c.code()).toBe('ABC234');
    expect(el.value).toBe('ABC234');
  });

  it('navigates only with a full 6-character code', () => {
    const c = TestBed.createComponent(HomeComponent).componentInstance;
    const router = TestBed.inject(Router);
    const calls: unknown[] = [];
    router.navigate = ((cmds: unknown[]) => { calls.push(cmds); return Promise.resolve(true); }) as Router['navigate'];
    c.onInput(input('ABC23'));
    c.go();
    expect(calls).toEqual([]);
    c.onInput(input('ABC234'));
    c.go();
    expect(calls).toEqual([['/c', 'ABC234']]);
  });
});
